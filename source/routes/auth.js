import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendOTP } from '../utils/mailer.js';

const router = express.Router();
const otpStore = new Map(); // In-memory OTP store (dev only)
const refreshTokenStore = new Map(); // In-memory refresh token store (use Redis in production)

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePhone = (phone) => /^[6-9]\d{9}$/.test(phone);
const validatePassword = (password) => password && password.length >= 6;

// Token generation helper
const generateTokens = (user) => {
  const payload = { 
    id: user._id, 
    email: user.email, 
    role: user.role,
    isAdmin: user.isAdmin 
  };
  
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
  
  // Store refresh token (use Redis in production)
  refreshTokenStore.set(user._id.toString(), refreshToken);
  
  return { accessToken, refreshToken };
};

// Middleware to verify access token
const verifyAccessToken = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Middleware to verify admin access
const verifyAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.adminUser = user;
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error verifying admin status' });
  }
};

// 🚨 TEMPORARY: Create first admin (REMOVE AFTER FIRST USE)
router.post('/admin/create-first', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      isAdmin: true,
      role: 'admin',
      isVerified: true
    });

    const { accessToken, refreshToken } = generateTokens(admin);

    res.status(201).json({
      success: true,
      message: 'First admin created',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isAdmin: admin.isAdmin
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Create first admin error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ======================= ADMIN LOGIN (Direct login for admins) =======================
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isAdmin) {
      return res.status(400).json({ success: false, message: 'Invalid admin credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Invalid admin credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    res.json({
      success: true,
      message: 'Admin login successful',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin,
        isVerified: user.isVerified
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ======================= REGISTER FLOW =======================

router.post('/register/send-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email address' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        const expiresAt = Date.now() + 5 * 60 * 1000;
        otpStore.set(email, { otp, expiresAt });

        await sendOTP(email, otp);

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ success: false, message: 'Server error while sending OTP' });
    }
});

router.post('/register/verify', async (req, res) => {
    try {
        const { name, email, password, otp, phone } = req.body;

        if (!name || !email || !password || !otp || !phone) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email address' });
        }
         if (!validatePhone(phone)) {
            return res.status(400).json({ success: false, message: 'Invalid mobile number' });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const storedOtp = otpStore.get(email);
        if (!storedOtp || storedOtp.otp != otp || storedOtp.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({
            name: name.trim(),
            phone: phone,
            email: email.toLowerCase(),
            password: hashedPassword
        });

        otpStore.delete(email);

        const { accessToken, refreshToken } = generateTokens(user);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                _id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// ======================= LOGIN FLOW =======================

router.post('/login/send-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email address' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        // Don't allow regular users to login via OTP if they are admins
        if (user.isAdmin) {
            return res.status(400).json({ success: false, message: 'Please use admin login for admin accounts' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        const expiresAt = Date.now() + 5 * 60 * 1000;
        otpStore.set(email, { otp, expiresAt });

        await sendOTP(email, otp);

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Login OTP error:', error);
        res.status(500).json({ success: false, message: 'Error sending OTP' });
    }
});

// ======================= LOGIN RESEND OTP =======================
router.post('/login/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email address' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        if (user.isAdmin) {
            return res.status(400).json({ success: false, message: 'Please use admin login for admin accounts' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        const expiresAt = Date.now() + 5 * 60 * 1000;
        otpStore.set(email, { otp, expiresAt });

        await sendOTP(email, otp);

        res.json({ success: true, message: 'OTP resent successfully' });
    } catch (error) {
        console.error('Resend OTP (login) error:', error);
        res.status(500).json({ success: false, message: 'Server error while resending OTP' });
    }
});


router.post('/login/verify', async (req, res) => {
    try {
        const { email, password, otp } = req.body;

        if (!email || !password || !otp) {
            return res.status(400).json({ success: false, message: 'Email, password, and OTP are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ success: false, message: 'Invalid email or password' });
        }

        // Don't allow regular users to login via OTP if they are admins
        if (user.isAdmin) {
            return res.status(400).json({ success: false, message: 'Please use admin login for admin accounts' });
        }

        const storedOtp = otpStore.get(email);
        if (!storedOtp || storedOtp.otp != otp || storedOtp.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        const { accessToken, refreshToken } = generateTokens(user);

        otpStore.delete(email);

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isAdmin: user.isAdmin,
                isVerified: user.isVerified
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        console.error('Login verify error:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// ======================= REFRESH TOKEN =======================
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({ success: false, message: 'Refresh token required' });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        
        // Check if refresh token exists in store
        const storedToken = refreshTokenStore.get(decoded.id);
        if (!storedToken || storedToken !== refreshToken) {
            return res.status(401).json({ success: false, message: 'Invalid refresh token' });
        }

        // Get user from database
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

        res.json({
            success: true,
            message: 'Tokens refreshed successfully',
            accessToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
        }
        res.status(500).json({ success: false, message: 'Token refresh failed' });
    }
});

// ======================= GET PROFILE =======================
router.get('/profile', verifyAccessToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile' });
    }
});

// ======================= ADMIN-ONLY: Update User Roles =======================
router.patch('/admin/update-role/:userId', verifyAccessToken, verifyAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const updateFields = req.body;

        // Only allow these fields to be updated
        const allowedFields = ['isAdmin', 'isVerified', 'role', 'isDeliveryBoy', 'isRestaurantOwner'];
        const updates = {};

        allowedFields.forEach(field => {
            if (updateFields.hasOwnProperty(field)) {
                updates[field] = updateFields[field];
            }
        });

        const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, message: 'User role updated successfully', user: updatedUser });
    } catch (error) {
        console.error('Admin role update error:', error);
        res.status(500).json({ success: false, message: 'Error updating user role' });
    }
});

// ======================= ADMIN-ONLY: Get All Users =======================
router.get('/admin/users', verifyAccessToken, verifyAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        
        const query = search ? {
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        } : {};

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            users,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

// ======================= LOGOUT =======================
router.post('/logout', verifyAccessToken, (req, res) => {
    try {
        // Remove refresh token from store
        refreshTokenStore.delete(req.user.id);
        
        res.json({ 
            success: true, 
            message: 'Logged out successfully. Please remove tokens from client storage.' 
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
});

// ======================= LOGOUT ALL DEVICES =======================
router.post('/logout-all', verifyAccessToken, (req, res) => {
    try {
        // Remove all refresh tokens for this user (in production, you'd invalidate all tokens in Redis)
        refreshTokenStore.delete(req.user.id);
        
        res.json({ 
            success: true, 
            message: 'Logged out from all devices successfully' 
        });
    } catch (error) {
        console.error('Logout all error:', error);
        res.status(500).json({ success: false, message: 'Logout all failed' });
    }
});

// ES6 export
export { router, verifyAccessToken, verifyAdmin };
