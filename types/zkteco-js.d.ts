/// <reference types="node" />
import { EventEmitter } from 'events';

declare module 'zkteco-js' {
  
  /**
   * A user object as returned by getUsers().
   * 
   * @param userId - Unique ID of the user
   * @param name - Name of the user
   * @param role - Role of the user (e.g. admin, employee)
   * @param password - Optional password for the user
   * @param fingerprint - Optional fingerprint data (if applicable)
   */
  export interface User {
    userId: number;
    name: string;
    role: number;
    password?: string;
    fingerprint?: any;
  }

  /**
   * An attendance log record on the device (as returned by getAttendances()).
   * 
   * @param sn - Serial number of the log
   * @param user_id - ID of the user who recorded this attendance
   * @param record_time - Timestamp when the attendance was recorded (ISO string)
   * @param type - Type of attendance (e.g. check-in, check-out)
   * @param state - State of the attendance (e.g. valid, invalid)
   */
  export interface AttendanceLog {
    sn: number;
    user_id: number;
    record_time: string;
    type: number;
    state: number;
  }

  /**
   * The raw device info object that your code builds by calling
   * getInfo().
   * 
   * @param userCounts - Number of users on the device
   * @param logCounts - Number of attendance logs on the device
   * @param logCapacity - Maximum number of attendance logs the device can hold
   * @param [key: string] - Additional keys that may be returned by the device
   * 
   */
  export interface RawDeviceInfo {
    userCounts: number;
    logCounts: number;
    logCapacity: number;
    [key: string]: any; // in case the device returns extra keys here
  }

  /**
   * The full device details object that your code builds by calling
   * getDeviceDetails().
   * 
   * @param info - Raw device info object (see RawDeviceInfo)
   * @param attendanceSize - Number of attendance logs on the device
   * @param pin - Device PIN code
   * @param currentTime - Current device time (ISO string)
   * @param serialNumber - Device serial number
   * @param faceOn - Whether face recognition is enabled (string)
   * @param ssr - SSR parameter (string)
   * @param firmware - Device firmware version
   * @param deviceName - Device model/name
   * @param platform - Platform info (e.g. Linux, Android)
   * @param os - Operating system info (e.g. Android 9)
   * @param vendor - Vendor info (e.g. ZKTeco)
   * @param productTime - Product timestamp (ISO string)
   * @param macAddress - Device MAC address
   */
  export interface DeviceDetails {
    info: RawDeviceInfo;
    attendanceSize: number;
    pin: string;
    currentTime: string;
    serialNumber: string;
    faceOn: string;
    ssr: string;
    firmware: string;
    deviceName: string;
    platform: string;
    os: string;
    vendor: string;
    productTime: string;
    macAddress: string;
    [key: string]: any; // in case there are extra fields
  }

  /**
   * Main SDK class. Wraps an EventEmitter around a TCP/UDP socket.
   * We declare every method and property that your index.ts uses,
   * including `socket` and `client` so that `device.socket` / `device.client`
   * compile without error.
   */
  export default class Zkteco extends EventEmitter {
    /**
     * Constructor arguments:
     * @param ip    - device IP address (e.g. "192.168.1.1")
     * @param port  - device port (usually 4370)
     * @param timeout - optional timeout in milliseconds (default: 5000)
     * @param inport - optional internal port for UDP (default: 4370)
     * 
     */
    constructor(ip: string, port: number, timeout?: number, inport?: number);

    /** If the library exposes internal socket/client handles at runtime… */
    socket?: any;
    client?: any;

    /** Establish a TCP/UDP connection; returns true on success */
    createSocket(cbErr?: (err: Error) => void, cbClose?: () => void): Promise<boolean>;

    /** Internal wrapper if the library routes commands via TCP/UDP */
    functionWrapper<T>(
      tcpCallback: () => Promise<T>,
      udpCallback?: () => Promise<T>,
      command?: string
    ): Promise<T>;

    /** Fetch all users (array, or { data: User[] }, or keyed object) */
    getUsers(): Promise<User[] | { data: User[] } | Record<string, User>>;

    /** Fetch the “info” subtree: { userCounts, logCounts, logCapacity } */
    getInfo(): Promise<RawDeviceInfo>;

    /** Fetch the number of attendance logs on the device */
    getAttendanceSize(): Promise<number>;

    /** Fetch the PIN code (string) */
    getPIN(): Promise<string>;

    /** Fetch the current device time (ISO string) */
    getTime(): Promise<string>;

    /** Fetch the device’s serial number (string) */
    getSerialNumber(): Promise<string>;

    /** Fetch whether face recognition is on (string) */
    getFaceOn(): Promise<string>;

    /** Fetch SSR parameter (string) */
    getSSR(): Promise<string>;

    /** Fetch the device firmware version (string) */
    getDeviceVersion(): Promise<string>;

    /** Fetch the device model/name (string) */
    getDeviceName(): Promise<string>;

    /** Fetch platform info (string) */
    getPlatform(): Promise<string>;

    /** Fetch operating system info (string) */
    getOS(): Promise<string>;

    /** Fetch vendor info (string) */
    getVendor(): Promise<string>;

    /** Fetch the product timestamp (ISO string) */
    getProductTime(): Promise<string>;

    /** Fetch the device MAC address (string) */
    getMacAddress(): Promise<string>;

    /** Fetch attendance logs; optional callback for streaming */
    getAttendances(cb?: (log: AttendanceLog) => void): Promise<AttendanceLog[] | Record<string, AttendanceLog>>;

    /** Subscribe to real-time logs (push‐based) */
    getRealTimeLogs(cb: (log: AttendanceLog) => void): Promise<void>;

    /** Disconnect from the device */
    disconnect(): Promise<boolean>;

    /** Reconnect to the device */
    connect(): Promise<boolean>;

    /** Free internal buffers/data */
    freeData(): Promise<void>;

    /** Disable device operations (e.g. scanning) */
    disableDevice(): Promise<boolean>;

    /** Enable device operations (e.g. scanning) */
    enableDevice(): Promise<boolean>;

    /** Check the socket status as a string */
    getSocketStatus(): Promise<string>;

    /** Clear all attendance logs from the device */
    clearAttendanceLog(): Promise<boolean>;

    /** Clear all user data and logs on the device */
    clearData(): Promise<boolean>;

    /** Execute a raw command on the device */
    executeCmd(command: number, data?: string): Promise<any>;

    /** Schedule a repeating callback */
    setIntervalSchedule(cb: () => void, interval: number): void;

    /** Schedule a one‐off callback */
    setTimerSchedule(cb: () => void, timeout: number): void;
  }
}
