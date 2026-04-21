const WebSocket = require('ws');
const net = require('net');
const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());

// Crear servidor HTTP
const server = http.createServer(app);

// Crear servidor WebSocket en el MISMO puerto 3000
const wss = new WebSocket.Server({ server });

console.log('🔌 WebSocket Proxy escuchando en wss://localhost:3000');

wss.on('connection', (ws) => {
  console.log('✅ Cliente conectado');

  let mudSocket = null;
  let serverHost = null;
  let serverPort = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Mensaje de conexión: { type: 'connect', host: '...', port: ... }
      if (data.type === 'connect') {
        serverHost = data.host;
        serverPort = data.port;

        console.log(`📡 Conectando a ${serverHost}:${serverPort}`);

        mudSocket = net.createConnection({ host: serverHost, port: serverPort }, () => {
          console.log(`✅ Conectado a ${serverHost}:${serverPort}`);
          ws.send(JSON.stringify({ type: 'connected' }));
        });

        // Datos del MUD → cliente (WebSocket)
        mudSocket.on('data', (buffer) => {
          ws.send(buffer);
        });

        mudSocket.on('close', () => {
          console.log('❌ MUD desconectado');
          ws.send(JSON.stringify({ type: 'closed' }));
        });

        mudSocket.on('error', (err) => {
          console.error('❌ Error MUD:', err.message);
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        });

      } else if (data.type === 'data' && mudSocket) {
        // Datos del cliente → MUD (TCP)
        const buffer = Buffer.from(data.payload, 'base64');
        mudSocket.write(buffer);
      }
    } catch (e) {
      // Si no es JSON, asumir que es dato binario directo (fallback)
      if (mudSocket && typeof message === 'object') {
        mudSocket.write(message);
      }
    }
  });

  ws.on('close', () => {
    console.log('❌ Cliente desconectado');
    if (mudSocket) {
      mudSocket.destroy();
    }
  });

  ws.on('error', (err) => {
    console.error('❌ Error WebSocket:', err.message);
  });
});

// Health check (para monitoreo)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', clients: wss.clients.size });
});

server.listen(3000, () => {
  console.log('🌐 WebSocket + HTTP server en puerto 3000');
});
