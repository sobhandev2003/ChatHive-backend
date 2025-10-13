// Middleware to protect REST endpoints by verifying JWT in Authorization header 
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // load User model 
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_super_secret';
module.exports = async function (req, res, next) {
    try {
        // console.log(req.cookies);
        // 
        const token = req.cookies?.token || req.headers.authorization.split(' ')[1]; // expect 'Bearer <token
        if (!token) return res.status(401).json({ error: 'Missing Authorization header' });
        const decoded = jwt.verify(token, JWT_SECRET); // attach user object to request for handlers to use 
        const user = await User.findById(decoded.userId).select('-passwordHash');
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = user;
        next(); // proceed to the next middleware / route handler
    } catch (err) {
        console.error('Auth middleware error:', err.message || err);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};