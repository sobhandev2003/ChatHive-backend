// src/routes/messages.js 
// REST endpoint to fetch message history between current user and another user 
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose'); // <-- Add this line
// protect this route 
const Message = require('../models/Message');
const User = require('../models/User');

// 📩 Get recent contacts (latest message per user)
// GET /messages/recent-contacts?limit=50
router.get('/recent-contacts', auth, async (req, res) => {
    try {
        const userId = req.user && req.user._id;
        // console.log('Fetching recent contacts for user:', userId);

        // ✅ Validate ObjectId before querying
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid or missing user ID' });
        }

        const userConnecttion = req.user.userConnecttion || [];
        if (userConnecttion.length === 0) {
            return res.json({ contacts: [] });
        }
        let contacts = [];
        for (const id of userConnecttion) {
            // if (id.toString() === userId.toString()) {
            //     console.log("Same user");
                
            //   continue;  
            // }
            const message = await Message.findOne({
                $or: [
                    { from: userId, to: id },
                    { from: id, to: userId }
                ]
            })
                .sort({ createdAt: -1 })
                .populate([
                    { path: 'from', select: '_id name email avatarUrl lastSeen' },
                    { path: 'to', select: '_id name email avatarUrl lastSeen' }
                ]);
            if (message) {
                contacts.push(message);
            }
        }
        // console.log(contacts);
        
        contacts = contacts.sort((a, b) => b.createdAt - a.createdAt);
        // console.log(contacts);

        // Respond with the contacts array
        res.json({ contacts });
    } catch (err) {
        console.error('Error fetching recent contacts:', err);
        res.status(500).json({ error: 'Server error fetching recent contacts' });
    }
});



// GET /messages/:otherUserId?limit=50&page=1 
// // Returns messages between req.user and otherUserId sorted ascending by createdAt 
router.get('/:otherUserId', auth, async (req, res) => {
    try {
        const otherUserId = req.params.otherUserId; // target user id 
        const userId = req.user._id; // current authenticated user 
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200); // cap limit 
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        // query messages where (from=user AND to=other) OR (from=other AND to=user) 
        const query = { $or: [{ from: userId, to: otherUserId }, { from: otherUserId, to: userId }] };
        // fetch, sort newest -> oldest then reverse to ascending chronological order 
        const messages = await Message.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(); // lean to get plain JS objects 
        // return messages in ascending order
        res.json({ messages: messages });
    } catch (err) {
        console.error('Fetch messages error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


module.exports = router;