// src/routes/upload.js
// File upload endpoint using multer + Cloudinary storage
// returns uploaded file URL in response

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const auth = require('../middleware/auth'); // protect uploads to authenticated users

// configure cloudinary using ENV vars
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// configure multer storage to upload directly to Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_files',                     // folder in Cloudinary
    allowed_formats: ['jpg','jpeg','png','gif','mp4','pdf','webp'] // allowed file types
  }
});

// create multer instance
const parser = multer({ storage });

// POST /upload - field name is "file"
// protected by auth middleware
router.post('/', auth, parser.single('avatar'), async(req, res) => {
  try {
    // multer + Cloudinary storage attaches file info to req.file
    // CloudinaryStorage typically sets req.file.path to the uploaded file URL
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // console.log(req);
    req.user.avatarUrl = req.file.path || req.file.url || req.file.secure_url;
    await req.user.save();
    
    // send back URL to client
    res.json({ url: req.file.path || req.file.url || req.file.secure_url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
