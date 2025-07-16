import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import Shop from '../models/shop.js';
import Food from '../models/Food.js';
import Order from '../models/Order.js';
import Review from '../models/Review.js';
const router = express.Router();

// Multer configuration for image uploads
const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

// Input validation helpers
const validateShopData = (shopData) => {
    const errors = [];
    const { name, image, address, phone, email, cuisine, location, foodLicence, menuCategory } = shopData;
    
    if (!name || name.trim().length < 2) {
        errors.push('Shop name must be at least 2 characters long');
    }
    if (!image || !isValidUrl(image)) {
        errors.push('Please provide a valid image URL');
    }
    if (!foodLicence || foodLicence.trim().length < 5) {
        errors.push('Food licence number is required (minimum 5 characters)');
    }
    if (!address || !address.street || !address.city || !address.state || !address.zipCode) {
        errors.push('Complete address is required (street, city, state, zipCode)');
    }
    if (!phone || !/^[\+]?[1-9][\d]{0,15}$/.test(phone)) {
        errors.push('Valid phone number is required');
    }
    if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
        errors.push('Valid email is required');
    }
    if (!cuisine || !Array.isArray(cuisine) || cuisine.length === 0) {
        errors.push('At least one cuisine type is required');
    }
    if (!menuCategory || !Array.isArray(menuCategory) || menuCategory.length === 0) {
        errors.push('At least one menu category is required');
    }
    if (!location || !location.coordinates || 
        !Array.isArray(location.coordinates) || 
        location.coordinates.length !== 2) {
        errors.push('Valid location coordinates [longitude, latitude] are required');
    }
    return errors;
};

const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
};

// Get all shops with advanced filtering for food delivery
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            cuisine,
            menuCategory,
            rating,
            search,
            latitude,
            longitude,
            maxDistance = 10, // in kilometers
            sortBy = 'rating.average',
            sortOrder = 'desc',
            featured,
            isOpen,
            deliveryAvailable,
            minDeliveryTime,
            maxDeliveryTime,
            priceRange, // low, medium, high
            offers, // true/false for shops with active offers
            fastDelivery // shops with delivery time < 30 mins
        } = req.query;

        // Base filter for active shops
        const filter = { isActive: true, isVerified: true };

        // Cuisine filter
        if (cuisine) {
            const cuisineArray = cuisine.split(',').map(c => c.trim());
            filter.cuisine = { $in: cuisineArray };
        }

        // Menu category filter
        if (menuCategory) {
            const categoryArray = menuCategory.split(',').map(c => c.trim());
            filter.menuCategory = { $in: categoryArray };
        }

        // Rating filter
        if (rating) {
            filter['rating.average'] = { $gte: parseFloat(rating) };
        }

        // Featured shops
        if (featured === 'true') {
            filter.isFeatured = true;
        }

        // Delivery availability
        if (deliveryAvailable === 'true') {
            filter.deliveryAvailable = true;
        }

        // Text search
        if (search) {
            filter.$text = { $search: search };
        }

        let query = Shop.find(filter);

        // Location-based filtering
        if (latitude && longitude) {
            const maxDistanceMeters = parseFloat(maxDistance) * 1000;
            query = Shop.find({
                ...filter,
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [parseFloat(longitude), parseFloat(latitude)]
                        },
                        $maxDistance: maxDistanceMeters
                    }
                }
            });
        }

        // Sorting (location queries are pre-sorted by distance)
        if (!latitude || !longitude) {
            const sort = {};
            if (search) {
                sort.score = { $meta: 'textScore' };
            } else {
                sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
            }
            query = query.sort(sort);
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const shops = await query
            .skip(skip)
            .limit(parseInt(limit))
            .populate('owner', 'name email phone')
            .lean();

        // Enhance shop data with delivery info
        const shopsWithDetails = await Promise.all(shops.map(async (shop) => {
            // Add distance if coordinates provided
            if (latitude && longitude) {
                const shopModel = new Shop(shop);
                shop.distance = shopModel.calculateDistance(parseFloat(latitude), parseFloat(longitude));
                shop.estimatedDeliveryTime = Math.max(20, Math.min(60, Math.round(shop.distance * 3) + 15));
            }

            // Add current open status
            const shopModel = new Shop(shop);
            shop.isCurrentlyOpen = shopModel.isCurrentlyOpen;

            // Get menu count
            shop.menuItemsCount = await Food.countDocuments({ 
                shopId: shop._id, 
                available: true 
            });

            // Get recent reviews count
            shop.recentReviewsCount = await Review.countDocuments({
                shopId: shop._id,
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            });

            // Calculate delivery charge based on distance
            if (shop.distance) {
                shop.calculatedDeliveryCharge = shop.distance > 5 ? 
                    shop.deliveryCharge + Math.round(shop.distance - 5) * 2 : 
                    shop.deliveryCharge;
            }

            return shop;
        }));

        // Apply additional filters
        let filteredShops = shopsWithDetails;

        // Filter by open status
        if (isOpen === 'true') {
            filteredShops = filteredShops.filter(shop => shop.isCurrentlyOpen);
        }

        // Filter by fast delivery
        if (fastDelivery === 'true') {
            filteredShops = filteredShops.filter(shop => 
                shop.estimatedDeliveryTime && shop.estimatedDeliveryTime <= 30
            );
        }

        // Get total count for pagination
        const total = await Shop.countDocuments(filter);
        const totalPages = Math.ceil(total / parseInt(limit));

        res.json({
            success: true,
            shops: filteredShops,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalItems: total,
                itemsPerPage: parseInt(limit),
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1
            },
            filters: {
                appliedFilters: {
                    cuisine,
                    menuCategory,
                    rating,
                    featured,
                    isOpen,
                    deliveryAvailable,
                    fastDelivery
                }
            }
        });
    } catch (error) {
        console.error('Get shops error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching shops'
        });
    }
});

// Get single shop with comprehensive details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { latitude, longitude } = req.query;

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shop ID format'
            });
        }

        const shop = await Shop.findById(id)
            .populate('owner', 'name email phone')
            .lean();

        if (!shop || !shop.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found or inactive'
            });
        }

        // Get shop's menu grouped by category
        const menu = await Food.aggregate([
            {
                $match: { 
                    shopId: shop._id, 
                    available: true 
                }
            },
            {
                $group: {
                    _id: '$category',
                    items: {
                        $push: {
                            _id: '$_id',
                            name: '$name',
                            description: '$description',
                            price: '$price',
                            image: '$image',
                            isVeg: '$isVeg',
                            rating: '$rating',
                            preparationTime: '$preparationTime',
                            calories: '$calories',
                            ingredients: '$ingredients',
                            customizations: '$customizations'
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        // Get recent reviews
        const reviews = await Review.find({ shopId: id })
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // Get shop statistics
        const stats = await Order.aggregate([
            {
                $match: { 
                    shopId: shop._id,
                    status: 'delivered',
                    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    avgDeliveryTime: { $avg: '$deliveryTime' },
                    totalRevenue: { $sum: '$totalAmount' }
                }
            }
        ]);

        // Add distance and delivery info
        if (latitude && longitude) {
            const shopModel = new Shop(shop);
            shop.distance = shopModel.calculateDistance(parseFloat(latitude), parseFloat(longitude));
            shop.estimatedDeliveryTime = Math.max(20, Math.min(60, Math.round(shop.distance * 3) + 15));
            shop.calculatedDeliveryCharge = shop.distance > 5 ? 
                shop.deliveryCharge + Math.round(shop.distance - 5) * 2 : 
                shop.deliveryCharge;
        }

        // Add current status
        const shopModel = new Shop(shop);
        shop.isCurrentlyOpen = shopModel.isCurrentlyOpen;

        // Popular items (most ordered)
        const popularItems = await Order.aggregate([
            {
                $match: { 
                    shopId: shop._id,
                    status: 'delivered',
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.foodId',
                    orderCount: { $sum: '$items.quantity' }
                }
            },
            { $sort: { orderCount: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'foods',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'foodDetails'
                }
            },
            { $unwind: '$foodDetails' },
            {
                $project: {
                    _id: '$foodDetails._id',
                    name: '$foodDetails.name',
                    price: '$foodDetails.price',
                    image: '$foodDetails.image',
                    orderCount: 1
                }
            }
        ]);

        res.json({
            success: true,
            shop,
            menu,
            reviews,
            popularItems,
            stats: stats[0] || { totalOrders: 0, avgDeliveryTime: 0, totalRevenue: 0 },
            deliveryInfo: {
                available: shop.deliveryAvailable,
                charge: shop.calculatedDeliveryCharge || shop.deliveryCharge,
                minOrderValue: shop.minOrderValue,
                estimatedTime: shop.estimatedDeliveryTime,
                distance: shop.distance
            }
        });
    } catch (error) {
        console.error('Get shop error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching shop'
        });
    }
});

// Create new shop with image upload
router.post('/create', authenticateToken, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
]), async (req, res) => {
    try {
        // Role check
        if (!req.user.isAdmin && !req.user.isShopOwner) {
            return res.status(403).json({
                success: false,
                message: 'Only admins or shop owners can create shops'
            });
        }

        const shopData = { ...req.body };

        // Handle file uploads (in production, upload to cloud storage)
        if (req.files?.image) {
            shopData.image = `/uploads/shops/${req.files.image[0].filename}`;
        }
        if (req.files?.coverImage) {
            shopData.coverImage = `/uploads/shops/${req.files.coverImage[0].filename}`;
        }

        // Parse JSON fields
        if (typeof shopData.address === 'string') {
            shopData.address = JSON.parse(shopData.address);
        }
        if (typeof shopData.location === 'string') {
            shopData.location = JSON.parse(shopData.location);
        }
        if (typeof shopData.cuisine === 'string') {
            shopData.cuisine = JSON.parse(shopData.cuisine);
        }
        if (typeof shopData.menuCategory === 'string') {
            shopData.menuCategory = JSON.parse(shopData.menuCategory);
        }

        // Validate input
        const validationErrors = validateShopData(shopData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Check for duplicate shop
        const existingShop = await Shop.findOne({
            $or: [
                { 
                    name: { $regex: `^${shopData.name.trim()}$`, $options: 'i' },
                    'address.city': { $regex: `^${shopData.address.city.trim()}$`, $options: 'i' }
                },
                { foodLicence: shopData.foodLicence },
                { phone: shopData.phone }
            ]
        });

        if (existingShop) {
            return res.status(400).json({
                success: false,
                message: 'Shop with this name, license, or phone already exists'
            });
        }

        // Create shop
        const shop = await Shop.create({
            ...shopData,
            owner: req.user.id,
            isVerified: false, // Admin needs to verify
            online: true,
            deliveryAvailable: shopData.deliveryAvailable ?? true,
            minOrderValue: shopData.minOrderValue || 100,
            deliveryCharge: shopData.deliveryCharge || 25,
            tax: shopData.tax || 5
        });

        const populatedShop = await Shop.findById(shop._id)
            .populate('owner', 'name email phone');

        res.status(201).json({
            success: true,
            message: 'Shop created successfully. Awaiting admin verification.',
            shop: populatedShop
        });
    } catch (error) {
        console.error('Create shop error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating shop'
        });
    }
});

// Update shop status (online/offline)
router.patch('/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { online } = req.body;

        const shop = await Shop.findById(id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        // Check ownership
        const isOwner = shop.owner.toString() === req.user.id;
        if (!isOwner && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }

        shop.online = online;
        await shop.save();

        res.json({
            success: true,
            message: `Shop is now ${online ? 'online' : 'offline'}`,
            shop: { online: shop.online }
        });
    } catch (error) {
        console.error('Update shop status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating shop status'
        });
    }
});

// Get shop analytics (for owners and admins)
router.get('/:id/analytics', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { period = '7d' } = req.query; // 7d, 30d, 90d

        const shop = await Shop.findById(id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        // Check authorization
        const isOwner = shop.owner.toString() === req.user.id;
        if (!isOwner && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }

        // Calculate date range
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Get analytics data
        const analytics = await Order.aggregate([
            {
                $match: {
                    shopId: shop._id,
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        status: "$status"
                    },
                    count: { $sum: 1 },
                    revenue: { $sum: "$totalAmount" }
                }
            },
            {
                $group: {
                    _id: "$_id.date",
                    orders: {
                        $push: {
                            status: "$_id.status",
                            count: "$count",
                            revenue: "$revenue"
                        }
                    },
                    totalOrders: { $sum: "$count" },
                    totalRevenue: { $sum: "$revenue" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Get top selling items
        const topItems = await Order.aggregate([
            {
                $match: {
                    shopId: shop._id,
                    status: 'delivered',
                    createdAt: { $gte: startDate }
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.foodId',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'foods',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'food'
                }
            },
            { $unwind: '$food' },
            {
                $project: {
                    name: '$food.name',
                    totalQuantity: 1,
                    totalRevenue: 1
                }
            }
        ]);

        res.json({
            success: true,
            analytics: {
                period,
                dailyStats: analytics,
                topSellingItems: topItems,
                summary: {
                    totalOrders: analytics.reduce((sum, day) => sum + day.totalOrders, 0),
                    totalRevenue: analytics.reduce((sum, day) => sum + day.totalRevenue, 0),
                    avgOrderValue: analytics.length > 0 ? 
                        analytics.reduce((sum, day) => sum + day.totalRevenue, 0) / 
                        analytics.reduce((sum, day) => sum + day.totalOrders, 0) : 0
                }
            }
        });
    } catch (error) {
        console.error('Get shop analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching analytics'
        });
    }
});

// Search shops with smart suggestions
router.post('/search', async (req, res) => {
    try {
        const {
            query,
            latitude,
            longitude,
            maxDistance = 10,
            limit = 20,
            filters = {}
        } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location coordinates are required'
            });
        }

        // Build search pipeline
        const pipeline = [
            {
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    distanceField: 'distance',
                    maxDistance: maxDistance * 1000,
                    spherical: true,
                    query: {
                        isActive: true,
                        isVerified: true,
                        ...(filters.deliveryAvailable && { deliveryAvailable: true })
                    }
                }
            }
        ];

        // Add text search if query provided
        if (query && query.trim()) {
            pipeline.push({
                $match: {
                    $or: [
                        { name: { $regex: query, $options: 'i' } },
                        { cuisine: { $in: [new RegExp(query, 'i')] } },
                        { menuCategory: { $in: [new RegExp(query, 'i')] } },
                        { 'address.city': { $regex: query, $options: 'i' } }
                    ]
                }
            });
        }

        // Add filters
        if (filters.rating) {
            pipeline.push({
                $match: { 'rating.average': { $gte: parseFloat(filters.rating) } }
            });
        }

        if (filters.cuisine) {
            pipeline.push({
                $match: { cuisine: { $in: filters.cuisine } }
            });
        }

        // Add limit
        pipeline.push({ $limit: parseInt(limit) });

        // Add population
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'owner',
                foreignField: '_id',
                as: 'owner'
            }
        });

        const shops = await Shop.aggregate(pipeline);

        // Enhance results
        const enhancedShops = shops.map(shop => ({
            ...shop,
            distance: Math.round(shop.distance / 1000 * 100) / 100, // Convert to km
            estimatedDeliveryTime: Math.max(20, Math.min(60, Math.round(shop.distance / 1000 * 3) + 15)),
            isCurrentlyOpen: new Shop(shop).isCurrentlyOpen
        }));

        res.json({
            success: true,
            shops: enhancedShops,
            count: enhancedShops.length,
            searchQuery: query
        });
    } catch (error) {
        console.error('Shop search error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while searching shops'
        });
    }
});

// Get shop recommendations based on user preferences
router.get('/recommendations/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const { latitude, longitude, limit = 10 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location coordinates are required'
            });
        }

        // Get user's order history to understand preferences
        const userOrders = await Order.find({ 
            userId, 
            status: 'delivered' 
        })
        .populate('shopId', 'cuisine menuCategory')
        .limit(50)
        .sort({ createdAt: -1 });

        // Extract preferred cuisines and categories
        const preferences = userOrders.reduce((acc, order) => {
            if (order.shopId) {
                acc.cuisines.push(...(order.shopId.cuisine || []));
                acc.categories.push(...(order.shopId.menuCategory || []));
            }
            return acc;
        }, { cuisines: [], categories: [] });

        // Get top preferences
        const topCuisines = [...new Set(preferences.cuisines)].slice(0, 5);
        const topCategories = [...new Set(preferences.categories)].slice(0, 5);

        // Find recommended shops
        const recommendations = await Shop.aggregate([
            {
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    distanceField: 'distance',
                    maxDistance: 10000, // 10km
                    spherical: true,
                    query: {
                        isActive: true,
                        isVerified: true,
                        online: true,
                        deliveryAvailable: true
                    }
                }
            },
            {
                $addFields: {
                    matchScore: {
                        $add: [
                            {
                                $size: {
                                    $setIntersection: ['$cuisine', topCuisines]
                                }
                            },
                            {
                                $size: {
                                    $setIntersection: ['$menuCategory', topCategories]
                                }
                            },
                            { $cond: [{ $gte: ['$rating.average', 4] }, 2, 0] },
                            { $cond: ['$isFeatured', 1, 0] }
                        ]
                    }
                }
            },
            {
                $sort: {
                    matchScore: -1,
                    'rating.average': -1,
                    distance: 1
                }
            },
            { $limit: parseInt(limit) },
            {
                $lookup: {
                    from: 'users',
                    localField: 'owner',
                    foreignField: '_id',
                    as: 'owner'
                }
            }
        ]);

        const enhancedRecommendations = recommendations.map(shop => ({
            ...shop,
            distance: Math.round(shop.distance / 1000 * 100) / 100,
            estimatedDeliveryTime: Math.max(20, Math.min(60, Math.round(shop.distance / 1000 * 3) + 15)),
            recommendationReason: shop.matchScore > 3 ? 'Based on your preferences' : 
                                shop.rating.average >= 4 ? 'Highly rated' : 'Popular nearby'
        }));

        res.json({
            success: true,
            recommendations: enhancedRecommendations,
            userPreferences: {
                topCuisines,
                topCategories
            }
        });
    } catch (error) {
        console.error('Get recommendations error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching recommendations'
        });
    }
});

// Admin route: Verify shop
router.patch('/admin/verify/:id', authenticateToken, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { id } = req.params;
        const { isVerified, verificationNotes } = req.body;

        const shop = await Shop.findByIdAndUpdate(
            id,
            { 
                isVerified,
                verificationNotes,
                verifiedAt: isVerified ? new Date() : null,
                verifiedBy: req.user.id
            },
            { new: true }
        ).populate('owner', 'name email phone');

        res.json({
            success: true,
            message: `Shop ${isVerified ? 'verified' : 'unverified'} successfully`,
            shop
        });
    } catch (error) {
        console.error('Verify shop error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while verifying shop'
        });
    }
});

// Get shops by owner (Protected route)
router.get('/owner/my-shops', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build filter
        const filter = { owner: req.user.id };
        if (status) {
            if (status === 'active') filter.isActive = true;
            if (status === 'inactive') filter.isActive = false;
            if (status === 'verified') filter.isVerified = true;
            if (status === 'pending') filter.isVerified = false;
        }

        const shops = await Shop.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('owner', 'name email phone')
            .lean();

        // Add enhanced data for each shop
        const enhancedShops = await Promise.all(shops.map(async (shop) => {
            // Get recent orders count
            const recentOrdersCount = await Order.countDocuments({
                shopId: shop._id,
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            });

            // Get pending orders count
            const pendingOrdersCount = await Order.countDocuments({
                shopId: shop._id,
                status: { $in: ['pending', 'confirmed', 'preparing'] }
            });

            // Get menu items count
            const menuItemsCount = await Food.countDocuments({
                shopId: shop._id,
                available: true
            });

            // Get today's revenue
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            
            const todayRevenue = await Order.aggregate([
                {
                    $match: {
                        shopId: shop._id,
                        status: 'delivered',
                        createdAt: { $gte: todayStart }
                    }
                },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$totalAmount' },
                        orders: { $sum: 1 }
                    }
                }
            ]);

            return {
                ...shop,
                stats: {
                    recentOrders: recentOrdersCount,
                    pendingOrders: pendingOrdersCount,
                    menuItems: menuItemsCount,
                    todayRevenue: todayRevenue[0]?.revenue || 0,
                    todayOrders: todayRevenue[0]?.orders || 0
                },
                isCurrentlyOpen: new Shop(shop).isCurrentlyOpen
            };
        }));

        const total = await Shop.countDocuments(filter);
        const totalPages = Math.ceil(total / parseInt(limit));

        res.json({
            success: true,
            shops: enhancedShops,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalItems: total,
                itemsPerPage: parseInt(limit),
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('Get owner shops error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching your shops'
        });
    }
});

// Update shop (Protected route - only owner or admin)
router.put('/update/:id', authenticateToken, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shop ID format'
            });
        }

        const shop = await Shop.findById(id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        // Role check
        const isOwner = shop.owner.toString() === req.user.id;
        if (!isOwner && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Only the shop owner or an admin can update the shop'
            });
        }

        // Handle file uploads
        if (req.files?.image) {
            updateData.image = `/uploads/shops/${req.files.image[0].filename}`;
        }
        if (req.files?.coverImage) {
            updateData.coverImage = `/uploads/shops/${req.files.coverImage[0].filename}`;
        }

        // Parse JSON fields if they're strings
        ['address', 'location', 'cuisine', 'menuCategory'].forEach(field => {
            if (updateData[field] && typeof updateData[field] === 'string') {
                try {
                    updateData[field] = JSON.parse(updateData[field]);
                } catch (e) {
                    // Keep original value if parsing fails
                }
            }
        });

        // If major details are changed, require re-verification
        const requiresVerification = ['name', 'foodLicence', 'address', 'phone'].some(
            field => updateData[field] && JSON.stringify(updateData[field]) !== JSON.stringify(shop[field])
        );

        if (requiresVerification && !req.user.isAdmin) {
            updateData.isVerified = false;
            updateData.verificationNotes = 'Re-verification required due to profile changes';
        }

        const updatedShop = await Shop.findByIdAndUpdate(
            id,
            { ...updateData, updatedAt: new Date() },
            { new: true, runValidators: true }
        ).populate('owner', 'name email phone');

        res.json({
            success: true,
            message: requiresVerification && !req.user.isAdmin ? 
                'Shop updated successfully. Re-verification required.' : 
                'Shop updated successfully',
            shop: updatedShop,
            requiresVerification: requiresVerification && !req.user.isAdmin
        });
    } catch (error) {
        console.error('Update shop error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating shop'
        });
    }
});

// Delete/Deactivate shop (Protected route - only owner or admin)
router.delete('/delete/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { permanent = false } = req.query;

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shop ID format'
            });
        }

        const shop = await Shop.findById(id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        const isOwner = shop.owner.toString() === req.user.id;
        if (!isOwner && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Only the shop owner or an admin can delete the shop'
            });
        }

        // Check for pending orders
        const pendingOrders = await Order.countDocuments({
            shopId: id,
            status: { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery'] }
        });

        if (pendingOrders > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete shop with ${pendingOrders} pending orders. Please complete or cancel them first.`
            });
        }

        if (permanent && req.user.isAdmin) {
            // Only admins can permanently delete
            await Shop.findByIdAndDelete(id);
            await Food.deleteMany({ shopId: id });
            await Review.deleteMany({ shopId: id });
        } else {
            // Soft delete
            await Shop.findByIdAndUpdate(id, { 
                isActive: false,
                deactivatedAt: new Date(),
                deactivatedBy: req.user.id
            });
        }

        res.json({
            success: true,
            message: permanent ? 'Shop permanently deleted' : 'Shop deactivated successfully'
        });
    } catch (error) {
        console.error('Delete shop error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting shop'
        });
    }
});

// Get shop categories, cuisines, and other metadata
router.get('/info/metadata', async (req, res) => {
    try {
        // Get distinct values from active shops
        const [categories, cuisines, menuCategories, cities] = await Promise.all([
            Shop.distinct('category', { isActive: true }),
            Shop.distinct('cuisine', { isActive: true }),
            Shop.distinct('menuCategory', { isActive: true }),
            Shop.distinct('address.city', { isActive: true })
        ]);

        // Predefined options
        const pricingOptions = ['₹', '₹₹', '₹₹₹', '₹₹₹₹'];
        const deliveryTimes = ['15-30 mins', '30-45 mins', '45-60 mins', '60+ mins'];
        const ratings = [4.5, 4.0, 3.5, 3.0];

        // Popular cuisines (you can make this dynamic based on shop count)
        const popularCuisines = [
            'North Indian', 'South Indian', 'Chinese', 'Italian', 
            'Continental', 'Mexican', 'Thai', 'Punjabi', 'Mughlai'
        ];

        // Popular menu categories
        const popularCategories = [
            'Pizza', 'Burgers', 'Biryani', 'Chinese', 'Desserts', 
            'Beverages', 'Pasta', 'Sandwiches', 'Wraps', 'Salads'
        ];

        res.json({
            success: true,
            metadata: {
                cuisines: {
                    all: [...new Set(cuisines.flat())].filter(c => c && c.trim() !== ''),
                    popular: popularCuisines
                },
                menuCategories: {
                    all: [...new Set(menuCategories.flat())].filter(c => c && c.trim() !== ''),
                    popular: popularCategories
                },
                cities: cities.filter(city => city && city.trim() !== ''),
                pricingOptions,
                deliveryTimes,
                ratings,
                sortOptions: [
                    { value: 'rating.average', label: 'Rating' },
                    { value: 'deliveryCharge', label: 'Delivery Fee' },
                    { value: 'createdAt', label: 'Newest' },
                    { value: 'totalOrders', label: 'Popularity' }
                ]
            }
        });
    } catch (error) {
        console.error('Get metadata error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching metadata'
        });
    }
});

// Get trending/popular shops
router.get('/trending', async (req, res) => {
    try {
        const { latitude, longitude, limit = 10 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location coordinates are required'
            });
        }

        // Get trending shops based on recent orders and ratings
        const trendingShops = await Shop.aggregate([
            {
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    distanceField: 'distance',
                    maxDistance: 15000, // 15km
                    spherical: true,
                    query: {
                        isActive: true,
                        isVerified: true,
                        online: true
                    }
                }
            },
            {
                $lookup: {
                    from: 'orders',
                    let: { shopId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$shopId', '$shopId'] },
                                status: 'delivered',
                                createdAt: { 
                                    $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                orderCount: { $sum: 1 },
                                totalRevenue: { $sum: '$totalAmount' }
                            }
                        }
                    ],
                    as: 'weeklyStats'
                }
            },
            {
                $addFields: {
                    trendingScore: {
                        $add: [
                            { $multiply: ['$rating.average', 2] },
                            { $ifNull: [{ $arrayElemAt: ['$weeklyStats.orderCount', 0] }, 0] },
                            { $cond: ['$isFeatured', 5, 0] },
                            { $cond: [{ $lte: ['$distance', 5000] }, 3, 0] } // Bonus for nearby
                        ]
                    },
                    weeklyOrders: { $ifNull: [{ $arrayElemAt: ['$weeklyStats.orderCount', 0] }, 0] }
                }
            },
            {
                $match: {
                    $or: [
                        { 'rating.average': { $gte: 4.0 } },
                        { weeklyOrders: { $gte: 5 } },
                        { isFeatured: true }
                    ]
                }
            },
            {
                $sort: { trendingScore: -1, 'rating.average': -1 }
            },
            { $limit: parseInt(limit) },
            {
                $lookup: {
                    from: 'users',
                    localField: 'owner',
                    foreignField: '_id',
                    as: 'owner'
                }
            },
            {
                $project: {
                    weeklyStats: 0,
                    trendingScore: 0
                }
            }
        ]);

        const enhancedShops = trendingShops.map(shop => ({
            ...shop,
            distance: Math.round(shop.distance / 1000 * 100) / 100,
            estimatedDeliveryTime: Math.max(20, Math.min(60, Math.round(shop.distance / 1000 * 3) + 15)),
            isCurrentlyOpen: new Shop(shop).isCurrentlyOpen,
            badge: shop.weeklyOrders >= 20 ? 'Hot' : 
                   shop.rating.average >= 4.5 ? 'Top Rated' : 
                   shop.isFeatured ? 'Featured' : 'Trending'
        }));

        res.json({
            success: true,
            trendingShops: enhancedShops,
            count: enhancedShops.length
        });
    } catch (error) {
        console.error('Get trending shops error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching trending shops'
        });
    }
});

// Get shops by cuisine
router.get('/cuisine/:cuisine', async (req, res) => {
    try {
        const { cuisine } = req.params;
        const { 
            latitude, 
            longitude, 
            maxDistance = 15,
            page = 1,
            limit = 20,
            sortBy = 'rating.average',
            sortOrder = 'desc'
        } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location coordinates are required'
            });
        }

        const shops = await Shop.aggregate([
            {
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    distanceField: 'distance',
                    maxDistance: parseFloat(maxDistance) * 1000,
                    spherical: true,
                    query: {
                        isActive: true,
                        isVerified: true,
                        cuisine: { $regex: new RegExp(cuisine, 'i') }
                    }
                }
            },
            {
                $sort: {
                    [sortBy]: sortOrder === 'asc' ? 1 : -1,
                    distance: 1
                }
            },
            {
                $skip: (parseInt(page) - 1) * parseInt(limit)
            },
            {
                $limit: parseInt(limit)
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'owner',
                    foreignField: '_id',
                    as: 'owner'
                }
            }
        ]);

        const enhancedShops = shops.map(shop => ({
            ...shop,
            distance: Math.round(shop.distance / 1000 * 100) / 100,
            estimatedDeliveryTime: Math.max(20, Math.min(60, Math.round(shop.distance / 1000 * 3) + 15)),
            isCurrentlyOpen: new Shop(shop).isCurrentlyOpen
        }));

        // Get total count for pagination
        const totalCount = await Shop.countDocuments({
            isActive: true,
            isVerified: true,
            cuisine: { $regex: new RegExp(cuisine, 'i') },
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: parseFloat(maxDistance) * 1000
                }
            }
        });

        res.json({
            success: true,
            cuisine: cuisine,
            shops: enhancedShops,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalItems: totalCount,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get shops by cuisine error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching shops by cuisine'
        });
    }
});

// Get shop dashboard summary (for owners)
router.get('/:id/dashboard', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const shop = await Shop.findById(id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        // Check ownership
        const isOwner = shop.owner.toString() === req.user.id;
        if (!isOwner && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const thisWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const thisMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Get comprehensive dashboard data
        const [
            todayStats,
            weeklyStats,
            monthlyStats,
            pendingOrders,
            recentReviews,
            topItems,
            menuItemsCount
        ] = await Promise.all([
            // Today's stats
            Order.aggregate([
                {
                    $match: {
                        shopId: shop._id,
                        createdAt: { $gte: today }
                    }
                },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        revenue: { $sum: '$totalAmount' }
                    }
                }
            ]),
            
            // Weekly stats
            Order.aggregate([
                {
                    $match: {
                        shopId: shop._id,
                        createdAt: { $gte: thisWeek }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        totalRevenue: { $sum: '$totalAmount' },
                        deliveredOrders: {
                            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                        }
                    }
                }
            ]),
            
            // Monthly stats
            Order.aggregate([
                {
                    $match: {
                        shopId: shop._id,
                        createdAt: { $gte: thisMonth }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        totalRevenue: { $sum: '$totalAmount' }
                    }
                }
            ]),
            
            // Pending orders
            Order.find({
                shopId: id,
                status: { $in: ['pending', 'confirmed', 'preparing'] }
            }).populate('userId', 'name phone').sort({ createdAt: -1 }).limit(10),
            
            // Recent reviews
            Review.find({ shopId: id })
                .populate('userId', 'name')
                .sort({ createdAt: -1 })
                .limit(5),
            
            // Top selling items this week
            Order.aggregate([
                {
                    $match: {
                        shopId: shop._id,
                        status: 'delivered',
                        createdAt: { $gte: thisWeek }
                    }
                },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.foodId',
                        totalQuantity: { $sum: '$items.quantity' },
                        totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
                    }
                },
                { $sort: { totalQuantity: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'foods',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'food'
                    }
                },
                { $unwind: '$food' }
            ]),
            
            // Menu items count
            Food.countDocuments({ shopId: id, available: true })
        ]);

        // Process today's stats
        const todayData = todayStats.reduce((acc, stat) => {
            acc[stat._id] = { count: stat.count, revenue: stat.revenue };
            return acc;
        }, {});

        const dashboardData = {
            shop: {
                name: shop.name,
                isOnline: shop.online,
                isCurrentlyOpen: shop.isCurrentlyOpen,
                rating: shop.rating,
                isVerified: shop.isVerified
            },
            today: {
                orders: Object.values(todayData).reduce((sum, stat) => sum + stat.count, 0),
                revenue: Object.values(todayData).reduce((sum, stat) => sum + stat.revenue, 0),
                pending: todayData.pending?.count || 0,
                delivered: todayData.delivered?.count || 0
            },
            weekly: weeklyStats[0] || { totalOrders: 0, totalRevenue: 0, deliveredOrders: 0 },
            monthly: monthlyStats[0] || { totalOrders: 0, totalRevenue: 0 },
            pendingOrders,
            recentReviews,
            topSellingItems: topItems,
            menuItemsCount,
            quickActions: [
                { label: 'Add Menu Item', action: 'add_menu_item' },
                { label: 'Update Hours', action: 'update_hours' },
                { label: 'Manage Orders', action: 'manage_orders' },
                { label: 'View Analytics', action: 'view_analytics' }
            ]
        };

        res.json({
            success: true,
            dashboard: dashboardData
        });
    } catch (error) {
        console.error('Get shop dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching dashboard data'
        });
    }
});

// Export router
export default router; 