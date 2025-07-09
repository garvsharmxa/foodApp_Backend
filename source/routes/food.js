import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Food from '../models/Food.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Multer configuration for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/foods/';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'food-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
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

// Admin/Restaurant Owner middleware
const authorizeRestaurantOwner = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'restaurant_owner') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Restaurant owner privileges required.'
            });
        }
        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Authorization error'
        });
    }
};

// Input validation helpers
const validateFoodData = (name, price, cooking_time, menu_category, shopid) => {
    const errors = [];
    
    if (!name || name.trim().length < 2) {
        errors.push('Name must be at least 2 characters long');
    }
    if (!price || isNaN(price) || price < 1) {
        errors.push('Price must be a number greater than or equal to 1');
    }
    if (!cooking_time || isNaN(cooking_time) || cooking_time < 1) {
        errors.push('Cooking time must be a number greater than or equal to 1');
    }
    if (!menu_category || isNaN(menu_category)) {
        errors.push('Menu category must be a valid number');
    }
    if (!shopid || isNaN(shopid)) {
        errors.push('Shop ID must be a valid number');
    }
    
    return errors;
};

// Get all foods with advanced filtering, pagination, and sorting
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            menu_category,
            cuisine,
            minPrice,
            maxPrice,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            instock,
            shopid,
            veg,
            beverage,
            minOrderNum
        } = req.query;

        // Build filter object
        const filter = {};
        
        if (menu_category) {
            filter.menu_category = parseInt(menu_category);
        }
        if (cuisine) {
            filter.cuisine = { $regex: cuisine, $options: 'i' };
        }
        if (shopid) {
            filter.shopid = parseInt(shopid);
        }
        if (instock !== undefined) {
            filter.instock = instock === 'true';
        }
        if (veg !== undefined) {
            filter.veg = veg === 'true';
        }
        if (beverage !== undefined) {
            filter.beverage = beverage === 'true';
        }
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = parseFloat(minPrice);
            if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
        }
        if (minOrderNum) {
            filter.order_num = { $gte: parseInt(minOrderNum) };
        }
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { cuisine: { $regex: search, $options: 'i' } }
            ];
        }

        // Build sort object
        const sort = {};
        const validSortFields = ['createdAt', 'updatedAt', 'name', 'price', 'order_num', 'cooking_time'];
        if (validSortFields.includes(sortBy)) {
            sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
        } else {
            sort.createdAt = -1;
        }

        // Calculate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        // Execute query with population
        const foods = await Food.find(filter)
            .populate('createdBy', 'name email')
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Get total count for pagination
        const total = await Food.countDocuments(filter);
        const totalPages = Math.ceil(total / limitNum);

        res.json({
            success: true,
            foods,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalItems: total,
                itemsPerPage: limitNum,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1
            },
            filters: {
                menu_category,
                cuisine,
                minPrice,
                maxPrice,
                search,
                instock,
                shopid,
                veg,
                beverage,
                minOrderNum
            }
        });
    } catch (error) {
        console.error('Get foods error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching foods',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get trending/popular foods
router.get('/trending', async (req, res) => {
    try {
        const { limit = 10, shopid } = req.query;
        
        const filter = {
            instock: true,
            order_num: { $gte: 5 } // Foods with at least 5 orders
        };
        
        if (shopid) {
            filter.shopid = parseInt(shopid);
        }

        const trendingFoods = await Food.find(filter)
            .sort({
                order_num: -1,
                createdAt: -1
            })
            .limit(parseInt(limit))
            .populate('createdBy', 'name')
            .lean();

        res.json({
            success: true,
            foods: trendingFoods,
            message: 'Trending foods fetched successfully'
        });
    } catch (error) {
        console.error('Get trending foods error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching trending foods'
        });
    }
});

// Get foods by shop
router.get('/shop/:shopid', async (req, res) => {
    try {
        const { shopid } = req.params;
        const { limit = 20, instock, veg, beverage, menu_category } = req.query;

        if (isNaN(shopid)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shop ID format'
            });
        }

        const filter = { shopid: parseInt(shopid) };
        
        if (instock !== undefined) {
            filter.instock = instock === 'true';
        }
        if (veg !== undefined) {
            filter.veg = veg === 'true';
        }
        if (beverage !== undefined) {
            filter.beverage = beverage === 'true';
        }
        if (menu_category) {
            filter.menu_category = parseInt(menu_category);
        }

        const foods = await Food.find(filter)
            .sort({ order_num: -1, createdAt: -1 })
            .limit(parseInt(limit))
            .populate('createdBy', 'name')
            .lean();

        res.json({
            success: true,
            foods,
            message: 'Shop foods fetched successfully'
        });
    } catch (error) {
        console.error('Get shop foods error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching shop foods'
        });
    }
});

// Get single food item by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid food ID format'
            });
        }

        const food = await Food.findById(id)
            .populate('createdBy', 'name email')
            .lean();

        if (!food) {
            return res.status(404).json({
                success: false,
                message: 'Food item not found'
            });
        }

        // Get related foods (same menu category or cuisine)
        const relatedFoods = await Food.find({
            _id: { $ne: id },
            $or: [
                { menu_category: food.menu_category },
                { cuisine: food.cuisine }
            ],
            shopid: food.shopid,
            instock: true
        })
            .limit(6)
            .populate('createdBy', 'name')
            .lean();

        res.json({
            success: true,
            food,
            relatedFoods,
            message: 'Food item fetched successfully'
        });
    } catch (error) {
        console.error('Get food error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching food item'
        });
    }
});

// Add a food item (Protected route - Restaurant owners/Admin only)
router.post('/add', authenticateToken, authorizeRestaurantOwner, upload.single('image'), async (req, res) => {
    try {
        const {
            name,
            cooking_time,
            price,
            instock = true,
            veg = false,
            beverage = false,
            cuisine = 'International',
            menu_category,
            shopid
        } = req.body;

        // Validate input
        const validationErrors = validateFoodData(name, price, cooking_time, menu_category, shopid);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Check if image is provided
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Food image is required'
            });
        }

        // Check if food with same name already exists for this shop
        const existingFood = await Food.findOne({
            name: { $regex: `^${name.trim()}$`, $options: 'i' },
            shopid: parseInt(shopid)
        });

        if (existingFood) {
            return res.status(400).json({
                success: false,
                message: 'Food item with this name already exists in this shop'
            });
        }

        const imageUrl = `/uploads/foods/${req.file.filename}`;

        // Create food item
        const food = await Food.create({
            name: name.trim(),
            cooking_time: parseInt(cooking_time),
            price: parseFloat(price),
            instock: instock === 'true' || instock === true,
            veg: veg === 'true' || veg === true,
            beverage: beverage === 'true' || beverage === true,
            cuisine: cuisine.trim(),
            menu_category: parseInt(menu_category),
            shopid: parseInt(shopid),
            image: imageUrl,
            createdBy: req.user.id
        });

        const populatedFood = await Food.findById(food._id)
            .populate('createdBy', 'name email')
            .lean();

        res.status(201).json({
            success: true,
            message: 'Food item added successfully',
            food: populatedFood
        });
    } catch (error) {
        console.error('Add food error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while adding food item',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update food item (Protected route)
router.put('/update/:id', authenticateToken, authorizeRestaurantOwner, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const updateFields = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid food ID format'
            });
        }

        // Check if food exists and belongs to user's shop
        const existingFood = await Food.findById(id);
        if (!existingFood) {
            return res.status(404).json({
                success: false,
                message: 'Food item not found'
            });
        }

        if (req.user.role !== 'admin' && existingFood.shopid !== req.user.shopid) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only update your own shop\'s food items.'
            });
        }

        // Build update object
        const updateData = {};

        if (updateFields.name) updateData.name = updateFields.name.trim();
        if (updateFields.cooking_time) updateData.cooking_time = parseInt(updateFields.cooking_time);
        if (updateFields.price) updateData.price = parseFloat(updateFields.price);
        if (updateFields.cuisine) updateData.cuisine = updateFields.cuisine.trim();
        if (updateFields.menu_category) updateData.menu_category = parseInt(updateFields.menu_category);
        if (updateFields.shopid) updateData.shopid = parseInt(updateFields.shopid);
        
        if (updateFields.instock !== undefined) {
            updateData.instock = updateFields.instock === 'true' || updateFields.instock === true;
        }
        if (updateFields.veg !== undefined) {
            updateData.veg = updateFields.veg === 'true' || updateFields.veg === true;
        }
        if (updateFields.beverage !== undefined) {
            updateData.beverage = updateFields.beverage === 'true' || updateFields.beverage === true;
        }

        // Handle image upload
        if (req.file) {
            updateData.image = `/uploads/foods/${req.file.filename}`;
            // TODO: Delete old image file
        }

        const food = await Food.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true
        })
            .populate('createdBy', 'name email')
            .lean();

        res.json({
            success: true,
            message: 'Food item updated successfully',
            food
        });
    } catch (error) {
        console.error('Update food error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating food item'
        });
    }
});

// Toggle food stock availability
router.patch('/toggle-stock/:id', authenticateToken, authorizeRestaurantOwner, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid food ID format'
            });
        }

        const food = await Food.findById(id);
        if (!food) {
            return res.status(404).json({
                success: false,
                message: 'Food item not found'
            });
        }

        // Check ownership
        if (req.user.role !== 'admin' && food.shopid !== req.user.shopid) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        food.instock = !food.instock;
        await food.save();

        res.json({
            success: true,
            message: `Food item ${food.instock ? 'is now in stock' : 'is now out of stock'}`,
            instock: food.instock
        });
    } catch (error) {
        console.error('Toggle stock error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while toggling stock status'
        });
    }
});

// Increment order count when food is ordered
router.patch('/increment-order/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity = 1 } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid food ID format'
            });
        }

        const food = await Food.findByIdAndUpdate(
            id,
            { $inc: { order_num: parseInt(quantity) } },
            { new: true }
        );

        if (!food) {
            return res.status(404).json({
                success: false,
                message: 'Food item not found'
            });
        }

        res.json({
            success: true,
            message: 'Order count updated successfully',
            order_num: food.order_num
        });
    } catch (error) {
        console.error('Increment order error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating order count'
        });
    }
});

// Delete food item (Protected route)
router.delete('/delete/:id', authenticateToken, authorizeRestaurantOwner, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid food ID format'
            });
        }

        const food = await Food.findById(id);
        if (!food) {
            return res.status(404).json({
                success: false,
                message: 'Food item not found'
            });
        }

        // Check ownership
        if (req.user.role !== 'admin' && food.shopid !== req.user.shopid) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only delete your own shop\'s food items.'
            });
        }

        await Food.findByIdAndDelete(id);
        // TODO: Delete associated image file

        res.json({
            success: true,
            message: 'Food item deleted successfully',
            deletedFood: { id, name: food.name }
        });
    } catch (error) {
        console.error('Delete food error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting food item'
        });
    }
});

// Get food cuisines
router.get('/meta/cuisines', async (req, res) => {
    try {
        const cuisines = await Food.distinct('cuisine', { instock: true });
        res.json({
            success: true,
            cuisines: cuisines.filter(cuisine => cuisine && cuisine.trim() !== '').sort()
        });
    } catch (error) {
        console.error('Get cuisines error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching cuisines'
        });
    }
});

// Get menu categories
router.get('/meta/categories', async (req, res) => {
    try {
        const categories = await Food.distinct('menu_category', { instock: true });
        res.json({
            success: true,
            categories: categories.filter(cat => cat !== null && cat !== undefined).sort()
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching categories'
        });
    }
});

// Get food statistics (Admin/Restaurant owner only)
router.get('/stats/overview', authenticateToken, authorizeRestaurantOwner, async (req, res) => {
    try {
        const filter = req.user.role === 'admin' ? {} : { shopid: req.user.shopid };
        
        const stats = await Food.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalFoods: { $sum: 1 },
                    instockFoods: { $sum: { $cond: ['$instock', 1, 0] } },
                    vegFoods: { $sum: { $cond: ['$veg', 1, 0] } },
                    beverages: { $sum: { $cond: ['$beverage', 1, 0] } },
                    avgPrice: { $avg: '$price' },
                    totalOrders: { $sum: '$order_num' },
                    avgCookingTime: { $avg: '$cooking_time' }
                }
            }
        ]);

        const categoryStats = await Food.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$menu_category',
                    count: { $sum: 1 },
                    avgPrice: { $avg: '$price' },
                    totalOrders: { $sum: '$order_num' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const cuisineStats = await Food.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$cuisine',
                    count: { $sum: 1 },
                    avgPrice: { $avg: '$price' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            stats: stats[0] || {
                totalFoods: 0,
                instockFoods: 0,
                vegFoods: 0,
                beverages: 0,
                avgPrice: 0,
                totalOrders: 0,
                avgCookingTime: 0
            },
            categoryStats,
            cuisineStats
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching statistics'
        });
    }
});

export default router;