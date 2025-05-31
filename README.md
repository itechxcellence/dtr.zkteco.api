# **DTR ZKteco Attendance API Server**

A **Node.js** API server and real-time Socket.IO service that streams attendance data from a ZKTeco device. Attendance snapshots are fetched on a schedule, published via Redis Pub/Sub, and exposed over REST and WebSocket endpoints. Easily test or demo your setup with built-in Ngrok integration.

## Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [Installation](#installation)
5. [Running the Server](#running-the-server)
6. [Exposing with Ngrok](#exposing-with-ngrok)
7. [API Usage](#api-usage)

   * [REST Endpoint](#rest-endpoint)
   * [Socket.IO](#socketio)
8. [Deployment (Windows)](#deployment-windows)
9. [Security & Best Practices](#security--best-practices)
10. [License](#license)

## Features

* **REST API**: `GET /api/v1/bio-sync` returns the latest attendance snapshot as JSON.
* **Real-time updates**: `Socket.IO` stream uses MsgPack to push incremental attendance events to clients.
* **Redis Pub/Sub**: Decouple data capture from client distribution; in-memory fallback when Redis is unavailable.
* **Ngrok Integration**: Quickly expose your local server over HTTPS for remote testing or demos.

## Prerequisites

* **Node.js** v22
* **npm** or **Yarn**
* **ZKTeco** biometric device on your network
* **Redis** instance (host, port, credentials)
* **Ngrok** account (for public tunneling)

## Configuration

1. Copy the `.env.example` to `.env` in the project root.
2. Update variables in `.env` as needed (ensure `.env` is in `.gitignore`):

```ini
# Redis
REDIS_HOST=your.redis.host
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=your_redis_password
REDIS_CHANNEL=attendance:updates

# ZKTeco Device
DEVICE_IP=192.168.1.201  # ZKTeco device IP address
DEVICE_PORT=4370
SEND_TIMEOUT=20000  # in milliseconds
RECV_TIMEOUT=20000  # in milliseconds

# Server
SERVER_PORT=8090
CLIENT_ORIGIN=http://localhost:3000  # frontend URL for CORS
```

## Installation

```bash
# Clone repository
git clone https://github.com/itechxcellence/dtr.zkteco.api.git
cd dtr.zkteco.api

# Install dependencies
npm install
# or
yarn install
```

## Running the Server

1. Ensure Redis is running and accessible per `.env` settings.
2. Confirm your ZKTeco device is configured and reachable.
3. Start the API server:

   ```bash
   node index.js
   ```

The server listens on `localhost:${SERVER_PORT}` by default.

## Exposing with Ngrok

1. Install and authenticate Ngrok.
2. Run:

   ```bash
   ngrok http ${SERVER_PORT}
   ```
3. Use the generated public HTTPS URL for both REST and Socket.IO clients.

## API Usage

### REST Endpoint

* **URL**: `GET /api/v1/bio-sync`
* **Response**: JSON array of the latest attendance records.

```bash
curl https://<ngrok-id>.ngrok.app/api/v1/bio-sync
```

### Socket.IO

Clients can subscribe to live updates:

```js
import { Server } from 'socket.io';
import msgpack from 'msgpack-lite';

const io = new Server(server, {
   cors:       { origin: CLIENT_ORIGIN, methods: ['GET','POST'] },
   transports: ['websocket'],
});

// Socket.IO connection handling
io.on('connection', socket => {
   console.log(`Client connected: ${socket.id}`);
   if (last_payload_obj) {
   socket.emit('attendance', msgpack.encode(last_payload_obj));
   }
   const message_handler = (_ch, msg) => {
   socket.emit('attendance', msg);
   };
   sub_client.on(REDIS_CHANNEL, message_handler);

   socket.on('disconnect', () => {
   sub_client.off(REDIS_CHANNEL, message_handler);
   });
});
```

## Deployment (Windows)

Use **Task Scheduler** or **NSSM** to run the server and Ngrok on boot:

1. **Ngrok config** (`%USERPROFILE%\AppData\Local\ngrok\ngrok.yml`):

   ```yaml
   version: "3"
    agent:
        authtoken: YOUR_NGROK_AUTHTOKEN
        crl_noverify: true # For Development only!
        update_check: false # For Development only!
    tunnels:
    attendance:
        proto: http
        addr: ${SERVER_PORT}
        basic_auth:
        - "user:password"
   ```

2. Create Windows services for both `node index.js` and Ngrok executable.

## Security & Best Practices

* **.env**: Keep out of source control (`.gitignore`) and restrict to `chmod 600` on Linux/macOS.
* **HTTPS**: Always use the Ngrok HTTPS URL or your own SSL setup in production.
* **Credentials Rotation**: Rotate Redis and Ngrok tokens periodically.
* **Access Control**: Protect endpoints via CORS, Basic Auth, or API keys.

## Contributing & Feedback

We welcome suggestions, feature requests, and improvements! Please use one of the following channels:

* **Issues & Pull Requests**: Open or comment on issues at [https://github.com/itechxcellence/dtr.zkteco.api/issues](https://github.com/itechxcellence/dtr.zkteco.api/issues)
* **Email**: Send suggestions/discussions to [ronzape@ronhedwigzape.com](mailto:ronzape@ronhedwigzape.com)

Feel free to fork the repo, make changes, and submit a pull request.

## License

MIT © ItechXcellence

