// server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

import { router as authRoutes } from './source/routes/auth.js';
import foodRoutes from './source/routes/food.js';
import shopRoutes from './source/routes/shop.js';
import cartRoutes from './source/routes/cart.js'
import { adminJs, adminRouter } from './source/routes/admin-panel.js';

dotenv.config(); // Load environment variables

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection - Updated with modern syntax
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('💡 Common solutions:');
    console.error('   - Check if your IP is whitelisted in MongoDB Atlas');
    console.error('   - Verify your MONGO_URI environment variable');
    console.error('   - Ensure your MongoDB Atlas cluster is running');
    process.exit(1); // Exit process if DB connection fails
  });

// MongoDB connection event listeners
mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected from MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('📴 MongoDB connection closed through app termination');
  process.exit(0);
});


// AdminJS Panel Setup
app.use(adminJs.options.rootPath, adminRouter);

// Health Check Route
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Food Delivery API is running...',
    status: 'success',
    timestamp: new Date().toISOString()
  });
});

// Application Routes
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/foods', foodRoutes);
app.use('/api/shops', shopRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({
    message: 'Server Error!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// Server Listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
  console.log(`🛠 Admin Panel: http://localhost:${PORT}${adminJs.options.rootPath}`);
});
