import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Shop name is required'],
        trim: true,
        minlength: [2, 'Shop name must be at least 2 characters long'],
        maxlength: [100, 'Shop name cannot exceed 100 characters']
    },
    foodLicence: {
        type: String,
        required: [true, 'Food licence number is required'],
        trim: true
    },
    image: {
        type: String,
        required: [true, 'Shop image is required'],
        trim: true
    },
    coverImage: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
        match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    address: {
        street: {
            type: String,
            required: [true, 'Street address is required'],
            trim: true
        },
        city: {
            type: String,
            required: [true, 'City is required'],
            trim: true
        },
        state: {
            type: String,
            required: [true, 'State is required'],
            trim: true
        },
        zipCode: {
            type: String,
            required: [true, 'Zip code is required'],
            trim: true
        },
        country: {
            type: String,
            default: 'India',
            trim: true
        }
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: [true, 'Location coordinates are required']
        }
    },
    cuisine: [{
        type: String,
        enum: [
            'Indian', 'American', 'Mughlai', 'Chinese',
            'Italian', 'North Indian', 'South Indian', 'Mexican',
            'Thai', 'Continental', 'Punjabi', ''
        ],
        required: true
    }],
    menuCategory: [{
        type: String,
        enum: [
            'Pasta', 'Pizza', 'Burgers', 'Sandwiches', 'Salads',
            'Chinese', 'Indian', 'Desserts', 'Beverages',
            'Soups', 'Wraps', 'Grilled', 'Mexican',
            'Italian', 'Snacks',
            'Biryani' // ✅ Add this
        ]
    }],
    rating: {
        average: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        }
    },
    cancelledOrders: {
        type: Number,
        default: 0
    },
    online: {
        type: Boolean,
        default: true
    },
    deliveryAvailable: {
        type: Boolean,
        default: true
    },
    minOrderValue: {
        type: Number,
        default: 0,
        min: 0
    },
    deliveryCharge: {
        type: Number,
        default: 0,
        min: 0
    },
    tax: {
        type: Number,
        default: 0,
        min: 0
    },
    openTime: {
        type: String,
        required: [true, 'Opening time is required'],
        default: '09:00' // 24h format
    },
    closeTime: {
        type: String,
        required: [true, 'Closing time is required'],
        default: '22:00'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    totalOrders: {
        type: Number,
        default: 0
    },
    totalRevenue: {
        type: Number,
        default: 0
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Shop owner is required']
    }
}, {
    timestamps: true
});

// Indexes
shopSchema.index({ location: '2dsphere' });
shopSchema.index({
    name: 'text',
    cuisine: 'text',
    'address.city': 'text',
    'address.state': 'text'
});
shopSchema.index({ cuisine: 1, isActive: 1 });
shopSchema.index({ 'rating.average': -1 });
shopSchema.index({ isFeatured: -1, isActive: 1 });

// Virtuals
shopSchema.virtual('fullAddress').get(function() {
    return `${this.address.street}, ${this.address.city}, ${this.address.state} ${this.address.zipCode}, ${this.address.country}`;
});

shopSchema.virtual('isCurrentlyOpen').get(function() {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    return currentTime >= this.openTime && currentTime <= this.closeTime;
});

// Methods
shopSchema.methods.calculateDistance = function(latitude, longitude) {
    const [shopLon, shopLat] = this.location.coordinates;
    const R = 6371;
    const dLat = (latitude - shopLat) * Math.PI / 180;
    const dLon = (longitude - shopLon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(shopLat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
};

shopSchema.methods.updateRating = async function(newRating) {
    const total = this.rating.average * this.rating.count;
    this.rating.count += 1;
    this.rating.average = Math.round(((total + newRating) / this.rating.count) * 10) / 10;
    return this.save();
};

shopSchema.statics.findNearby = function(longitude, latitude, maxDistance = 10000) {
    return this.find({
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                $maxDistance: maxDistance
            }
        },
        isActive: true
    });
};

shopSchema.pre('save', function(next) {
    if (this.location && this.location.coordinates) {
        const [lon, lat] = this.location.coordinates;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
            return next(new Error('Invalid coordinates.'));
        }
    }
    next();
});

shopSchema.set('toJSON', { virtuals: true });
shopSchema.set('toObject', { virtuals: true });

const Shop = mongoose.models.Shop || mongoose.model('Shop', shopSchema);


export default Shop;