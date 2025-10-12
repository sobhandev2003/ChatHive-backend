// User schema for MongoDB (Mongoose)
const mongoose = require('mongoose'); // import mongoose 
// define User schema: fields and types
const UserSchema = new mongoose.Schema({
    name: { type: String }, // user's display name 
    email: { type: String, unique: true, sparse: true, required: true }, // email (unique if provided)
    phone: { type: String, unique: true, sparse: true }, // phone (optional) 
    passwordHash: { type: String }, // hashed password (bcrypt) 
    avatarUrl: { type: String }, // optional avatar image URL 
    lastSeen: { type: Date }, // last online timestamp 
    savedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // references to saved users
    userConnecttion: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User'}], // references to saved users

}, { timestamps: true }); // automatically add createdAt and updatedAt 
// export the model to use in app 
module.exports = mongoose.model('User', UserSchema);