import TcpSocket from 'react-native-tcp-socket';
import { ServerProfile } from '../types';

// Telnet command bytes
const IAC = 255;  // Interpret As Command
const WILL = 251;
const WONT = 252;
const DO = 253;
const DONT = 254;
const SB = 250;   // Subnegotiation Begin
const SE = 240;   // Subnegotiation End

// Telnet options we care about
const OPT_ECHO = 1;
const OPT_SGA = 3;    // Suppress Go Ahead
const OPT_TTYPE = 24; // Terminal Type
const OPT_NAWS = 31;  // Window Size

export type TelnetEventHandler = {
  onData: (text: string) => void;
  onConnect: () => void;
  onClose: () => void;
  onError: (error: string) => void;
};

export class TelnetService {
  private socket: ReturnType<typeof TcpSocket.createConnection> | null = null;
  private handler: TelnetEventHandler;
  private server: ServerProfile;
  private buffer: number[] = [];

  constructor(server: ServerProfile, handler: TelnetEventHandler) {
    this.server = server;
    this.handler = handler;
  }

  connect(): void {
    try {
      this.socket = TcpSocket.createConnection(
        { host: this.server.host, port: this.server.port },
        () => {
          this.handler.onConnect();
        }
      );

      this.socket.on('data', (data: Buffer | string) => {
        const bytes = typeof data === 'string'
          ? Array.from(data).map(c => c.charCodeAt(0))
          : Array.from(data);
        this.processBytes(bytes);
      });

      this.socket.on('close', () => {
        this.handler.onClose();
      });

      this.socket.on('error', (error: Error) => {
        this.handler.onError(error.message);
      });
    } catch (e: any) {
      this.handler.onError(e.message ?? 'Connection failed');
    }
  }

  private processBytes(bytes: number[]): void {
    let textChunk = '';
    let i = 0;

    while (i < bytes.length) {
      const byte = bytes[i];

      if (byte === IAC) {
        // Flush text accumulated so far
        if (textChunk) {
          this.handler.onData(textChunk);
          textChunk = '';
        }

        i++;
        if (i >= bytes.length) break;

        const cmd = bytes[i];
        if (cmd === IAC) {
          // Escaped IAC -> literal 255
          textChunk += String.fromCharCode(255);
          i++;
        } else if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
          i++;
          if (i >= bytes.length) break;
          const opt = bytes[i];
          this.handleNegotiation(cmd, opt);
          i++;
        } else if (cmd === SB) {
          // Subnegotiation - skip until IAC SE
          i++;
          while (i < bytes.length - 1) {
            if (bytes[i] === IAC && bytes[i + 1] === SE) {
              i += 2;
              break;
            }
            i++;
          }
        } else {
          i++;
        }
      } else {
        // Filter out null bytes and carriage returns
        if (byte !== 0 && byte !== 13) {
          textChunk += String.fromCharCode(byte);
        }
        i++;
      }
    }

    if (textChunk) {
      this.handler.onData(textChunk);
    }
  }

  private handleNegotiation(cmd: number, opt: number): void {
    if (!this.socket) return;

    // Accept SGA and ECHO, refuse everything else
    if (cmd === WILL) {
      if (opt === OPT_SGA || opt === OPT_ECHO) {
        this.sendCommand(DO, opt);
      } else {
        this.sendCommand(DONT, opt);
      }
    } else if (cmd === DO) {
      if (opt === OPT_TTYPE) {
        this.sendCommand(WILL, opt);
      } else if (opt === OPT_NAWS) {
        this.sendCommand(WILL, opt);
        // Send window size: 80x24
        this.socket.write(Buffer.from([IAC, SB, OPT_NAWS, 0, 80, 0, 24, IAC, SE]));
      } else {
        this.sendCommand(WONT, opt);
      }
    }
  }

  private sendCommand(cmd: number, opt: number): void {
    if (this.socket) {
      this.socket.write(Buffer.from([IAC, cmd, opt]));
    }
  }

  send(text: string): void {
    if (this.socket) {
      const data = text + '\r\n';
      this.socket.write(Buffer.from(data, 'utf8'));
    }
  }

  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
  }

  get isConnected(): boolean {
    return this.socket !== null;
  }
}
