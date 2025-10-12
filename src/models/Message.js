// Message schema for storing chat messages 
const mongoose = require('mongoose');
const MessageSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // sender (user id) 
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // recipient (user id) 
    content: { type: String, required: true }, // message text or media URL 
    contentType: { type: String, default: 'text' }, // 'text'|'image'|'file' 
    deliveredAt: { type: Date, default: null }, // when delivered to recipient (null if not yet) 
    readAt: { type: Date, default: null }, // when recipient read the message 
    meta: { type: Object, default: {} }, // optional meta (e.g., file size, mime) 
    createdAt: { type: Date, default: Date.now } // message creation time 
});
// index for retrieving undelivered messages quickly 
MessageSchema.index({ to: 1, deliveredAt: 1, createdAt: -1 });
module.exports = mongoose.model('Message', MessageSchema);