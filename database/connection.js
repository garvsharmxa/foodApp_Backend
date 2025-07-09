// database/connection.js or in your server.js
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // Connect without deprecated options
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/food_delivery');
    
    console.log('✅ MongoDB Connected');
    
    // Optional: Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
      process.exit(0);
    });
    
    return conn;
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

// If you're connecting directly in server.js, replace any connection code that looks like this:
// mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
// 
// With this:
// mongoose.connect(uri)

export default connectDB;