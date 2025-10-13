// Signup and Login endpoints 
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); // for hashing passwords 
const jwt = require('jsonwebtoken'); // for generating JWT 
const User = require('../models/User'); // user model 
const auth = require('../middleware/auth'); // protect uploads to authenticated users
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_super_secret';
const JWT_EXPIRES_IN = '30d'; // token lifetime 

// POST /auth/signup
//  // body: { name, email, password } 
router.post('/signup', async (req, res) => {
  try {
    console.log('Signup request', req.body);

    const { name, email, password } = req.body; // read values from request body
    // console.log({ name, email, password });

    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    // check existing user by email 
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    // hash the password before saving 
    const passwordHash = await bcrypt.hash(password, 10);
    // create user record 
    const user = new User({ name, email, passwordHash });
    await user.save();
    // create JWT token to return to client 
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    // respond with token and basic user info (do not send passwordHash) 
    res.cookie('token', token, {
      // httpOnly: true,
      secure: true,        // localhost → false
      sameSite: "none",      // not 'none'
      maxAge: 30 * 24 * 60 * 60 * 1000,
    })
      .json({ token, user: { id: user._id, name: user.name, email: user.email } });

  } catch (err) {
    console.error('Signup error:', err); res.status(500).json({ error: 'Server error' });
  }
});
// POST /auth/login
// body: { email, password } 
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    // find user by email const 
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    // compare provided password with stored hash 
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    // create JWT and return 
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.cookie('token', token, {
      // httpOnly: true,
      secure: true,        // localhost → false
      sameSite:"none",      // not 'none'
      maxAge: 30 * 24 * 60 * 60 * 1000,
    })
      .json({ token, user: { id: user._id, name: user.name, email: user.email } });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /auth/logout
router.get('/logout',auth, (req, res) => {
  res.clearCookie('token', {
    sameSite: 'none',
    secure: true
  }).json({ message: 'Logged out' });
});

//Get current loged in user info
router.get('/', auth, async (req, res) => {
  try {
    // console.log('Get current user', req.user);
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({ user: req.user });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Server error' });

  }
});

// Search users by name or email starting with query
router.get('/search', auth, async (req, res) => {
  try {
    let { q } = req.query;
    q = q ? q.trim() : "";

    let users;

    if (!q) {
      // No query → return first 10 users (exclude self)
      users = await User.find({
        _id: { $ne: req.user.userId }
      })
        .select("name email")
        .limit(10);
    } else {
      // Search by query
      const regex = new RegExp("^" + q, "i"); // starts with, case-insensitive

      users = await User.find({
        $and: [
          { _id: { $ne: req.user.userId } }, // exclude self
          {
            $or: [
              { name: { $regex: regex } },
              { email: { $regex: regex } }
            ]
          }
        ]
      })
        .select("name email")
        .limit(10); // still limit results to 10
    }

    users.filter(u => u._id.toString() !== req.user.userId);

    res.json({ users });
  } catch (error) {
    console.error("User search error:", error);
    res.status(500).json({ error: "Server error while searching users" });
  }
});

//Conect web socket for the authenticated user
router.get('/connect', auth, async (req, res) => {
  try {

    const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
    console.log("/connect",req.cookies);
    
    if (!token) return res.status(401).json({ error: 'Missing Authorization token' });
    const address = req.socket.address();
    const ip = address.address === '::' ? 'localhost' : address.address;
    const port = address.port;
    const wsBase = `wss://${process.env.RENDER_EXTERNAL_HOSTNAME}`; // Use actual IP and port
    const wsUrl = `${wsBase}/?token=${token}`;
    res.json({ wsUrl });
  } catch (error) {
    console.error("WebSocket connect error:", error);
    res.status(500).json({ error: "Server error while connecting WebSocket" });

  }
})



module.exports = router;