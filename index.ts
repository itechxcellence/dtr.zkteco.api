import dotenv                    from 'dotenv';
import path                      from 'path';
import { fileURLToPath }         from 'url';
import { dirname }               from 'path';
import express, { Request, Response } from 'express';
import http                      from 'http';
import { Server }                from 'socket.io';
import { createClient, RedisClientType } from 'redis';
import { EventEmitter }          from 'events';
import msgpack                   from 'notepack.io';
import Zkteco, {
  User,
  AttendanceLog,
  RawDeviceInfo
} from 'zkteco-js';

// ─── LOAD ENVIRONMENT VARIABLES ───────────────────────────────────────────────
dotenv.config();
/*
 If you ever switch to ES modules + want to explicitly point to “.env” next to index.ts:
 dotenv.config({
   path: path.join(dirname(fileURLToPath(import.meta.url)), '.env'),
 });
*/

// ─── TYPE DEFINITIONS ──────────────────────────────────────────────────────────
/**
 * This is exactly what you will send to Redis or over Socket.IO.
 */
interface AttendancePayload {
  timestamp: number;
  device_details: {
    info: RawDeviceInfo;
    attendance_size: number;
    pin: string;
    current_time: string;
    serial_number: string;
    face_on: string;
    ssr: string;
    firmware: string;
    device_name: string;
    platform: string;
    os: string;
    vendor: string;
    product_time: string;
    mac_address: string;
  };
  users: { user_id: number; name: string; role: number }[];
  logs: {
    sn: number;
    employee_id: number;
    name: string;
    record_time: string;
    type: number;
    state: number;
  }[];
}

// Pub/Sub can be either a Redis client or our fallback EventEmitter
type PubSubClient = RedisClientType | EventEmitter;

// ─── ENVIRONMENT VARIABLES ────────────────────────────────────────────────────
const {
  REDIS_HOST     = '127.0.0.1',
  REDIS_PORT     = '6379',
  REDIS_USERNAME = 'default',
  REDIS_PASSWORD = '',
  REDIS_CHANNEL  = 'attendance:updates',
  DEVICE_IP      = '192.168.1.1',
  DEVICE_PORT    = '4370',
  SEND_TIMEOUT   = '20000',
  RECV_TIMEOUT   = '20000',
  SERVER_PORT    = '8090',
  CLIENT_ORIGIN  = 'http://localhost:3000',
} = process.env;

// ─── PUB/SUB HANDLES ──────────────────────────────────────────────────────────
let pub_client: PubSubClient;
let sub_client: PubSubClient;

/**
 * Initialize Redis Pub/Sub. If Redis is unavailable, fall back to
 * an in‑process EventEmitter so the rest of your code still works.
 */
async function init_pub_sub() {
  try {
    // 1) Create & connect primary Redis client
    const redis_client: RedisClientType = createClient({
      username: REDIS_USERNAME,
      password: REDIS_PASSWORD,
      socket: {
        host: REDIS_HOST,
        port: Number(REDIS_PORT),
      },
    }) as RedisClientType;

    redis_client.on('error', err => console.error('Redis Client Error', err));
    await redis_client.connect();

    // 2) Duplicate & connect a subscriber
    const subscriber: RedisClientType = redis_client.duplicate() as RedisClientType;
    await subscriber.connect();
    subscriber.setMaxListeners(20);

    // 3) Assign pub & sub
    pub_client = redis_client;
    sub_client = subscriber;

    console.log('✅ Connected to Redis Pub/Sub');
  } catch (err) {
    console.warn('⚠️ Redis unavailable, using in‑process EventEmitter fallback', err);

    // Fallback: a simple EventEmitter bus
    const bus = new EventEmitter();
    bus.setMaxListeners(20);
    pub_client = bus;
    sub_client = bus;
  }
}

// ─── MAIN EXECUTION ───────────────────────────────────────────────────────────
(async () => {
  // ── 1) Instantiate the Zkteco SDK & open a socket ───────────────────────────
  const device = new Zkteco(
    DEVICE_IP,
    Number(DEVICE_PORT),
    Number(SEND_TIMEOUT),
    Number(RECV_TIMEOUT),
  );
  await device.createSocket();

  // ── 2) Increase internal maxListeners, in case the library exposes them ──────
  if ((device as any).socket && typeof (device as any).socket.setMaxListeners === 'function') {
    (device as any).socket.setMaxListeners(20);
  }
  if ((device as any).client && typeof (device as any).client.setMaxListeners === 'function') {
    (device as any).client.setMaxListeners(20);
  }

  // ── 3) FETCH DEVICE DETAILS & USERS ─────────────────────────────────────────
  let device_details: AttendancePayload['device_details'];
  let users_device: { user_id: number; name: string; role: number }[] = [];

  try {
    // 3.a) “info” subtree: { userCounts, logCounts, logCapacity }
    const raw_info: RawDeviceInfo = await device.getInfo();

    // 3.b) In parallel, call every other getter you need:
    const [
      attendance_size,
      pin,
      current_time,
      serial_number,
      face_on,
      ssr,
      firmware,
      device_name,
      platform,
      os,
      vendor,
      product_time,
      mac_address,
    ] = await Promise.all([
      device.getAttendanceSize(),
      device.getPIN(),
      device.getTime(),
      device.getSerialNumber(),
      device.getFaceOn(),
      device.getSSR(),
      device.getDeviceVersion(),
      device.getDeviceName(),
      device.getPlatform(),
      device.getOS(),
      device.getVendor(),
      device.getProductTime(),
      device.getMacAddress(),
    ]);

    device_details = {
      info: raw_info,
      attendance_size,
      pin,
      current_time,
      serial_number,
      face_on,
      ssr,
      firmware,
      device_name,
      platform,
      os,
      vendor,
      product_time,
      mac_address,
    };
  } catch (err) {
    console.warn('⚠️ Could not fetch some device details; using defaults', err);

    device_details = {
      info: { userCounts: 0, logCounts: 0, logCapacity: 0 },
      attendance_size: 0,
      pin: '',
      current_time: '',
      serial_number: '',
      face_on: '',
      ssr: '',
      firmware: '',
      device_name: '',
      platform: '',
      os: '',
      vendor: '',
      product_time: '',
      mac_address: '',
    };
  }

  // 3.c) FETCH & NORMALIZE USERS
  const raw_users = await device.getUsers();
  const users_array: User[] = Array.isArray(raw_users)
    ? raw_users
    : Array.isArray((raw_users as any).data)
      ? (raw_users as any).data
      : Object.values(raw_users as Record<string, User>);

  users_device = users_array.map(u => ({
    user_id: u.userId,
    name:   u.name,
    role:   u.role,
  }));

  // ─── 4) INIT PUB/SUB ────────────────────────────────────────────────────────
  await init_pub_sub();

  // ─── 5) PREPARE & PUBLISH ATTENDANCE LOGS ─────────────────────────────────
  const start_of_year = new Date(new Date().getFullYear(), 0, 1).getTime();
  let last_payload_obj: AttendancePayload | null = null;

  async function publish_attendances() {
    // 5.a) Fetch raw attendance records (array or keyed object)
    const raw = await device.getAttendances();
    const arr: AttendanceLog[] = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any).data)
        ? (raw as any).data
        : Object.values(raw as Record<string, AttendanceLog>);

    // 5.b) Filter by timestamp and enrich with user names
    const enriched = arr
      .filter(r => {
        const ts = new Date(r.record_time).getTime();
        return ts >= start_of_year && ts <= Date.now();
      })
      .map(r => ({
        sn:          r.sn,
        employee_id: r.user_id,
        name:        users_device.find(u => u.user_id === r.user_id)?.name ?? 'Unknown',
        record_time: r.record_time,
        type:        r.type,
        state:       r.state,
      }));

    const payload: AttendancePayload = {
      timestamp:      Date.now(),
      device_details,
      users:          users_device,
      logs:           enriched,
    };
    last_payload_obj = payload;

    // 5.c) Pack & publish via Redis (or EventEmitter fallback)
    const packed = msgpack.encode(payload);
    if ('publish' in (pub_client as RedisClientType)) {
      // Redis path
      await (pub_client as RedisClientType).publish(REDIS_CHANNEL, packed);
    } else {
      // EventEmitter fallback
      (pub_client as EventEmitter).emit(REDIS_CHANNEL, packed);
    }
  }

  // Initial publish, then every 60 seconds:
  await publish_attendances();
  setInterval(publish_attendances, 60_000);

  // ─── 6) EXPRESS & SOCKET.IO SETUP ───────────────────────────────────────────
  const app = express();
  const http_server = http.createServer(app);
  const io = new Server(http_server, {
    cors:       { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
    transports: ['websocket'],
  });

  // 6.a) REST endpoint to return latest payload on demand
  app.get('/api/v1/bio-sync', (_req: Request, res: Response) => {
    if (!last_payload_obj) {
      res.sendStatus(204);
      return;
    }
    res.json(last_payload_obj);
  });

  // 6.b) Socket.IO: on connect, send the latest payload immediately, then forward updates
  io.on('connection', socket => {
    console.log(`Client connected: ${socket.id}`);
    if (last_payload_obj) {
      socket.emit('attendance', msgpack.encode(last_payload_obj));
    }
    const handler = (_ch: string, msg: Buffer) => {
      socket.emit('attendance', msg);
    };
    (sub_client as EventEmitter).on(REDIS_CHANNEL, handler);
    socket.on('disconnect', () => {
      (sub_client as EventEmitter).off(REDIS_CHANNEL, handler);
    });
  });

  // 7) Start the HTTP server
  http_server.listen(Number(SERVER_PORT), () => {
    console.log(`⚡️ Server listening on port ${SERVER_PORT}`);
  });
})().catch(err => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
