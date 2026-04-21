import TcpSocket from 'react-native-tcp-socket';
import { Platform } from 'react-native';
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
const OPT_GMCP = 201; // GMCP

export type TelnetEventHandler = {
  onData: (text: string) => void;
  onConnect: () => void;
  onClose: () => void;
  onError: (error: string) => void;
  onGMCP?: (module: string, data: any) => void;
};

export class TelnetService {
  private socket: ReturnType<typeof TcpSocket.createConnection> | null = null;
  private webSocket: WebSocket | null = null;
  private handler: TelnetEventHandler;
  private server: ServerProfile;
  private encoding: string;
  private proxyUrl: string = 'wss://mitorch.onrender.com';

  constructor(server: ServerProfile, handler: TelnetEventHandler, encoding: string = 'utf8') {
    this.server = server;
    this.handler = handler;
    this.encoding = encoding;
  }

  setProxyUrl(url: string): void {
    this.proxyUrl = url;
  }

  connect(): void {
    try {
      if (Platform.OS === 'web') {
        this.connectViaWebSocket();
      } else {
        this.connectViaTCP();
      }
    } catch (e: any) {
      this.handler.onError(e.message ?? 'Connection failed');
    }
  }

  private connectViaTCP(): void {
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
  }

  private connectViaWebSocket(): void {
    try {
      this.webSocket = new WebSocket(this.proxyUrl);
      this.webSocket.binaryType = 'arraybuffer';

      this.webSocket.onopen = () => {
        // Enviar comando de conexión al proxy
        this.webSocket!.send(JSON.stringify({
          type: 'connect',
          host: this.server.host,
          port: this.server.port
        }));
      };

      this.webSocket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'connected') {
              this.handler.onConnect();
            } else if (msg.type === 'closed') {
              this.handler.onClose();
            } else if (msg.type === 'error') {
              this.handler.onError(msg.message);
            }
          } catch {
            // No es JSON, ignorar
          }
        } else if (event.data instanceof ArrayBuffer) {
          // Datos binarios del MUD
          const bytes = Array.from(new Uint8Array(event.data));
          this.processBytes(bytes);
        }
      };

      this.webSocket.onclose = () => {
        this.handler.onClose();
      };

      this.webSocket.onerror = (error) => {
        this.handler.onError('WebSocket error: ' + error);
      };
    } catch (e: any) {
      this.handler.onError(e.message ?? 'WebSocket connection failed');
    }
  }

  private processBytes(bytes: number[]): void {
    let textBytes: number[] = [];
    let i = 0;

    while (i < bytes.length) {
      const byte = bytes[i];

      if (byte === IAC) {
        // Flush text accumulated so far
        if (textBytes.length > 0) {
          this.emitText(textBytes);
          textBytes = [];
        }

        i++;
        if (i >= bytes.length) break;

        const cmd = bytes[i];
        if (cmd === IAC) {
          // Escaped IAC -> literal 255
          textBytes.push(255);
          i++;
        } else if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
          i++;
          if (i >= bytes.length) break;
          const opt = bytes[i];
          this.handleNegotiation(cmd, opt);
          i++;
        } else if (cmd === SB) {
          // Subnegotiation - collect bytes until IAC SE
          i++;
          const sbData: number[] = [];
          while (i < bytes.length - 1) {
            if (bytes[i] === IAC && bytes[i + 1] === SE) {
              i += 2;
              break;
            }
            sbData.push(bytes[i]);
            i++;
          }
          this.handleSubnegotiation(sbData);
        } else {
          i++;
        }
      } else {
        // Filter out null bytes and carriage returns
        if (byte !== 0 && byte !== 13) {
          textBytes.push(byte);
        }
        i++;
      }
    }

    if (textBytes.length > 0) {
      this.emitText(textBytes);
    }
  }

  private emitText(bytes: number[]): void {
    let text: string;

    try {
      // Try to decode using the specified encoding
      text = Buffer.from(bytes).toString(this.encoding as BufferEncoding);
    } catch (e) {
      // Fallback to UTF-8 if specified encoding fails
      console.warn(`[telnetService] Failed to decode with ${this.encoding}: ${e}`);
      text = Buffer.from(bytes).toString('utf8');
    }

    if (text) {
      if (text.length > 100 || text.includes('bando') || text.includes('Imágenes') || text.includes('imagen')) {
        // telnetService logs removed ⚠️ ENCODING:', this.encoding, '| bytes:', bytes.length, '| text length:', text.length);
        // telnetService logs removed First 100 chars:', JSON.stringify(text.slice(0, 100)));
      }
      this.handler.onData(text);
    }
  }

  private handleNegotiation(cmd: number, opt: number): void {
    if (!this.socket) return;

    if (cmd === WILL) {
      if (opt === OPT_SGA || opt === OPT_ECHO || opt === OPT_GMCP) {
        this.sendCommand(DO, opt);
        if (opt === OPT_GMCP) {
          this.sendGMCP('Core.Hello', { client: "Al'jhtar Store", version: "1.0" });
          this.sendGMCPRaw('Core.Supports.Set [ "Room 1", "Char 1", "Comm 1", "Core 1" ]');
        }
      } else {
        this.sendCommand(DONT, opt);
      }
    } else if (cmd === DO) {
      if (opt === OPT_TTYPE) {
        this.sendCommand(WILL, opt);
      } else if (opt === OPT_NAWS) {
        this.sendCommand(WILL, opt);
        this.socket.write(Buffer.from([IAC, SB, OPT_NAWS, 0, 80, 0, 24, IAC, SE]));
      } else if (opt === OPT_GMCP) {
        this.sendCommand(WILL, opt);
      } else {
        this.sendCommand(WONT, opt);
      }
    }
  }

  private handleSubnegotiation(data: number[]): void {
    if (data.length < 1) return;

    const opt = data[0];
    if (opt === OPT_GMCP && data.length > 1) {
      // GMCP message: option byte + "Module.Name <json data>"
      const text = data.slice(1).map(b => String.fromCharCode(b)).join('');
      const spaceIdx = text.indexOf(' ');

      let module: string;
      let payload: any;

      if (spaceIdx === -1) {
        module = text;
        payload = undefined;
      } else {
        module = text.slice(0, spaceIdx);
        const jsonStr = text.slice(spaceIdx + 1);
        // GMCP RAW logs removed ${module}: ${jsonStr}`);
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          payload = jsonStr;
        }
      }

      this.handler.onGMCP?.(module, payload);
    }
  }

  sendGMCP(module: string, data: any): void {
    if (!this.socket) return;
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    const message = `${module} ${jsonStr}`;
    this.sendGMCPRaw(message);
  }

  sendGMCPRaw(message: string): void {
    if (!this.socket) return;
    const msgBytes = Array.from(Buffer.from(message, 'utf8'));
    const packet = [IAC, SB, OPT_GMCP, ...msgBytes, IAC, SE];
    this.socket.write(Buffer.from(packet));
  }

  private sendCommand(cmd: number, opt: number): void {
    const buffer = Buffer.from([IAC, cmd, opt]);
    this.writeToSocket(buffer);
  }

  send(text: string): void {
    const data = text + '\r\n';
    this.writeToSocket(Buffer.from(data, 'utf8'));
  }

  private writeToSocket(buffer: Buffer): void {
    if (this.socket) {
      this.socket.write(buffer);
    } else if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify({
        type: 'data',
        payload: buffer.toString('base64')
      }));
    }
  }

  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
    if (this.webSocket) {
      try {
        this.webSocket.close();
      } catch {}
      this.webSocket = null;
    }
  }

  get isConnected(): boolean {
    return this.socket !== null || (this.webSocket !== null && this.webSocket.readyState === WebSocket.OPEN);
  }
}
