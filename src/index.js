// src/index.js
// Main server file: Express HTTP server + WebSocket server
// Handles WebSocket authentication, one-to-one messaging, offline delivery, typing, delivered/read receipts

require('dotenv').config();                      // load .env into process.env
const express = require('express');              // express for REST API
const http = require('http');                    // node http server
const WebSocket = require('ws');                 // ws library for WebSocket
const mongoose = require('mongoose');            // mongoose for MongoDB
const jwt = require('jsonwebtoken');             // jwt to verify tokens
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// import models and routes
const User = require('./models/User');
const Message = require('./models/Message');
const authRoutes = require('./routes/auth');
const messagesRoutes = require('./routes/messages');
const uploadRoutes = require('./routes/upload');
const { log } = require('console');

const PORT = process.env.PORT || 3000;           // server port
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp';
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_super_secret';

// ----- connect to MongoDB -----
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// ----- setup Express -----
const app = express();
app.use(cors({
  origin: "http://localhost:5173", // frontend dev server (e.g. Vite/React)
  credentials: true,
}));                               // enable CORS
app.use(cookieParser());                        // parse cookies
app.use(helmet());                               // basic security headers
app.use(express.json());                         // parse JSON bodies

// mount REST routes
app.use('/auth', authRoutes);                    // signup/login
app.use('/messages', messagesRoutes);            // fetch history
app.use('/upload', uploadRoutes);                // file/image upload

// simple health-check endpoint
app.get('/', (req, res) => res.send('Realtime chat server is running'));

// create HTTP server and attach WebSocket server to it
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --------------------------------------------------------------------
// In-memory mapping of connected sockets:
// userId (string) -> Set of WebSocket objects (handles multi-device)
// --------------------------------------------------------------------
const userSockets = new Map();

// add a WebSocket for a user
function addSocketForUser(userId, ws) {
  const id = String(userId);
  if (!userSockets.has(id)) userSockets.set(id, new Set());
  userSockets.get(id).add(ws);
  broadcastOnlineUsers()

}

// remove a WebSocket for a user
function removeSocketForUser(userId, ws) {
  const id = String(userId);
  const set = userSockets.get(id);
  // console.log('socket closed for user', id, 'remaining:', set );

  if (!set) return;
  set.delete(ws);
  if (set.size === 0) userSockets.delete(id);
  broadcastOnlineUsers()
}

// send a JSON payload to all connected sockets for a user
// returns true if any socket was open and message was attempted
function sendToUser(userId, payload) {
  const id = String(userId);
  const set = userSockets.get(id);
  // console.log('sendToUser', id, 'sockets:', set ? set.size : 0, 'payload:', payload);

  if (!set) return false;
  const str = JSON.stringify(payload);
  for (const s of set) {
    try {
      if (s.readyState === WebSocket.OPEN) s.send(str);
    } catch (err) {
      console.error('sendToUser error:', err);
    }
  }
  return true;
}

// Broadcasts all online user details to all online users whenever userSockets changes
function broadcastOnlineUsers() {
  // Gather all online user IDs
  const onlineUserIds = Array.from(userSockets.keys());
  // Optionally, fetch user details from DB if needed (here, just IDs)
  const payload = {
    type: 'online_users',
    payload: { userIds: onlineUserIds }
  };
  const msg = JSON.stringify(payload);
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }
}

// Wrap add/remove to trigger broadcast
// function addSocketForUser(userId, ws) {
//   const id = String(userId);
//   if (!userSockets.has(id)) userSockets.set(id, new Set());
//   userSockets.get(id).add(ws);
//   broadcastOnlineUsers();
// }

// function removeSocketForUser(userId, ws) {
//   const id = String(userId);
//   const set = userSockets.get(id);
//   if (!set) return;
//   set.delete(ws);
//   if (set.size === 0) userSockets.delete(id);
//   broadcastOnlineUsers();
// }


// helper: parse token from query string like ws://host:3000/?token=...
function getTokenFromReq(req) {
  try {
    // req.url contains path + query (e.g. "/?token=...")
    const query = new URL(req.url, `http://${req.headers.host}`).searchParams;
    // console.log('getTokenFromReq', query.toString());

    return query.get('token');
  } catch (err) {
    return null;
  }
}

// ----- WebSocket connection handling -----
wss.on('connection', async (ws, req) => {
  // console.log('Incoming WS connection', userSockets);
  // console.log('Ws ▶️',ws);
  // console.log('Req ▶️',req);


  // 1) try to get token from query param
  let token = getTokenFromReq(req);

  // 2) If no token in URL, wait for client to send an identify message
  //    (client may send first message: { type: 'identify', token: '...' })
  let authDecoded = null;
  let userId = null;

  // timeout for authentication (close if not authenticated within 10s)
  let authTimeout = setTimeout(() => {
    if (!userId) {
      try { ws.close(4003, 'Auth timeout'); } catch (e) { }
    }
  }, 10000);

  // helper to finalize authentication once we have token
  async function finalizeAuth(tokenStr) {
    try {
      const decoded = jwt.verify(tokenStr, JWT_SECRET);
      userId = decoded.userId;
      ws.userId = userId;
      addSocketForUser(userId, ws);
      //NOTE - 
      // sendToAllExcept(userId, {
      //   type: 'user_online',
      //   payload: { userId, lastSeen: new Date() },
      // });
      // update lastSeen to now (user is online)
      await User.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch(() => { });
      // send welcome
      ws.send(JSON.stringify({ type: 'welcome', payload: { content: 'Welcome to the chat server' } }));

      // deliver undelivered messages for this user
      const pending = await Message.find({ to: userId, deliveredAt: null }).sort({ createdAt: 1 });
      for (const msg of pending) {
        // send message to this socket
        ws.send(JSON.stringify({ type: 'message', payload: msg }));
        // mark delivered
        msg.deliveredAt = new Date();
        await msg.save();
        sendToUser(msg.from, { type: 'delivered', payload: { message:msg } });
        // optionally notify sender that message delivered
      }
      clearTimeout(authTimeout); // authenticated, cancel auth timeout
    } catch (err) {
      console.error('WebSocket auth failed:', err.message || err);
      try { ws.close(4002, 'Auth failed'); } catch (e) { }
    }
  }

  // If token present in URL, try finalize right away
  if (token) finalizeAuth(token);

  // message handler for incoming ws messages
  ws.on('message', async (raw) => {
    // if not yet authenticated, allow identify message carrying token
    if (!userId) {
      // try parse raw as JSON
      let safe;
      try { safe = JSON.parse(raw.toString()); } catch (e) {
        // ignore non-JSON prior to auth
        return;
      }
      if (safe && safe.type === 'identify' && safe.token) {
        // client identified itself, attempt to finalize
        return finalizeAuth(safe.token);
      } else {
        // ignore other messages until authenticated
        return;
      }
    }

    // parse JSON messages from authenticated users
    let data;
    try { data = JSON.parse(raw.toString()); } catch (err) {
      console.warn('Received non-JSON WS message from', userId);
      return;
    }

    // HANDLE different message types:
    // - direct_message : send text/media to another user
    // - typing         : typing indicator -> forwarded
    // - read           : mark messages read -> notify sender(s)
    // - ping/pong etc  : keep-alive (optional)

    if (data.type === 'direct_message') {
      // data: { type:'direct_message', to: '<userId>', content: 'hi', contentType: 'text' }
      try {
        // create and save message (source of truth)
        const msg = new Message({
          from: userId,
          to: data.to,
          content: data.content,
          contentType: data.contentType || 'text',
          meta: data.meta || {}
        });
        await msg.save();

        //Updaet user connection if not already present
        await User.updateOne(
          { _id: userId },
          { $addToSet: { userConnecttion: data.to } } // ensures uniqueness automatically
        );


        await User.updateOne(
          { _id: data.to },
          { $addToSet: { userConnecttion: userId } } // ensures uniqueness automatically
        );


        // const fromUser = await User.findById(msg.from).select('name email avatarUrl');
        // const toUser = await User.findById(msg.to).select('name email avatarUrl');

        // try deliver to recipient (if online on any instance)
        const delivered = sendToUser(data.to, { type: 'message', payload: msg });

        // if delivered, mark deliveredAt now
        if (delivered) {
          msg.deliveredAt = new Date();
          await msg.save();
        }

        // acknowledge sender that message was accepted / stored
        ws.send(JSON.stringify({ type: 'sent', payload: { message:msg,frontendKey:data.msgKey, delivered: Boolean(delivered), createdAt: msg.createdAt } }));

        // if recipient offline (delivered=false) the message stays in DB
        // and will be delivered next time they connect in finalizeAuth
      } catch (err) {
        console.error('direct_message handling error:', err);
        ws.send(JSON.stringify({ type: 'error', payload: 'Failed to send message' }));
      }
    }

    else if (data.type === 'typing') {
      // data: { type:'typing', to: '<userId>', state: true/false }
      try {
        // forward typing state to recipient (if online)
        sendToUser(data.to, { type: 'typing', from: userId, state: Boolean(data.state) });
      } catch (err) {
        console.error('typing forward error:', err);
      }
    }

    else if (data.type === 'read') {
      // data: { type:'read', messageIds: ['id1','id2', ...] }
      try {
        const now = new Date();
        const notReadMessages = await Message.find({to: userId,readAt: null });
        for (const msg of notReadMessages) {
          msg.readAt = now;
          await msg.save();
          sendToUser(msg.from, { type: 'read', payload: { message:msg} });
        }

        // notify each sender that their messages were read
      
      } catch (err) {
        console.error('read handling error:', err);
      }
    }

    else if (data.type === 'ping') {
      // keepalive from client -> respond pong
      ws.send(JSON.stringify({ type: 'pong' }));
    }

    else {
      // unknown message type
      ws.send(JSON.stringify({ type: 'error', payload: 'Unknown message type' }));
    }
  });

  ws.on('close', async () => {
    // when socket closes, remove it from userSockets mapping
    if (ws.userId) {
      removeSocketForUser(ws.userId, ws);
      console.log("Removed user");

      if (!userSockets.has(String(ws.userId))) {
        // sendToAllExcept(ws.userId, {
        //   type: 'user_offline',
        //   payload: { userId: ws.userId, lastSeen: new Date() },
        // });

        // set lastSeen for the user (they went offline)
        try {
          await User.findByIdAndUpdate(ws.userId, { lastSeen: new Date() });
        } catch (e) {

        }
        console.log('WS disconnected for user', ws.userId);
      }
    } else {
      console.log('Unauthenticated socket closed');
    }
  });

  ws.on('error', (err) => {
    console.error('WS error:', err);
  });
});

// start the HTTP + WS server
server.listen(PORT, () => {
  const address = server.address();

  // address can be { address: '::', family: 'IPv6', port: 3000 }
  const ip = address.address === '::' ? 'localhost' : address.address;
  const port = address.port;

  console.log(`🚀 Server running at http://${ip}:${port}`);
});