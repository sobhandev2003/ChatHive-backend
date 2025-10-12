# Realtime Chat Server

Minimal Node.js server using Express and ws for WebSocket connections.

Quick start

1. Install dependencies:

   ```powershell
   cd "d:\Personal Work\web_devolopment\Fullstack\React with Ts\Realtime Chat\server"
   npm install
   ```

2. Start server:

   ```powershell
   npm start
   ```

3. Server will run on http://localhost:3000 by default. Open a WebSocket client to ws://localhost:3000/ to send/receive messages.

Notes

- This is a minimal demo. For production, add authentication, persistence, message validation, and scaling (Redis/pubsub).
- The project includes a simple HTTP GET / which returns a running message.
