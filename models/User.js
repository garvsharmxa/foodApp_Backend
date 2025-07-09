import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'User name is required'],
        trim: true
    },
    email: {
        type: String,
        unique: true,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6
    },
    phone: {
        type: String,
        trim: true,
        match: [/^[\+]?[1-9][\d]{0,15}$/, 'Invalid phone number']
    },
    address: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        zipCode: { type: String, trim: true },
        country: { type: String, trim: true, default: 'India' }
    },
    role: {
        type: String,
        enum: ['customer', 'deliveryBoy', 'admin', 'restaurantOwner'],
        default: 'customer'
    },
    isDeliveryBoy: {
        type: Boolean,
        default: false
    },
    isRestaurantOwner: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    profileImage: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date
    }
}, {
    timestamps: true
});

const User = mongoose.model('User', UserSchema);

export default User;