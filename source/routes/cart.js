import express from 'express';
import Cart from '../models/cart.js';
import Food from '../models/Food.js';
import Shop from '../models/shop.js';
import Order from '../models/Order.js';
import { verifyAccessToken as authenticateToken } from '../routes/auth.js';


const router = express.Router();

// Get user's cart
router.get('/', authenticateToken, async (req, res) => {
  try {
    const cart = await Cart.findOne({ 
      user: req.user.id, 
      isCheckedOut: false 
    })
    .populate('items.food', 'name price image category')
    .populate('items.shop', 'name address');

    if (!cart) {
      return res.json({
        success: true,
        data: {
          items: [],
          totalAmount: 0,
          itemCount: 0
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...cart.toObject(),
        itemCount: cart.items.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching cart',
      error: error.message
    });
  }
});

// Add item to cart
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { foodId, shopId, quantity = 1 } = req.body;

    // Validate input
    if (!foodId || !shopId) {
      return res.status(400).json({
        success: false,
        message: 'Food ID and Shop ID are required'
      });
    }

    // Check if food exists and belongs to the shop
    const food = await Food.findById(foodId);
    if (!food) {
      return res.status(404).json({
        success: false,
        message: 'Food item not found'
      });
    }

    if (food.shop.toString() !== shopId) {
      return res.status(400).json({
        success: false,
        message: 'Food item does not belong to the specified shop'
      });
    }

    // Check if food is available
    if (!food.available) {
      return res.status(400).json({
        success: false,
        message: 'Food item is currently unavailable'
      });
    }

    // Find or create cart
    let cart = await Cart.findOne({ 
      user: req.user.id, 
      isCheckedOut: false 
    });

    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.food.toString() === foodId && item.shop.toString() === shopId
    );

    const price = food.price;
    const subtotal = price * quantity;

    if (existingItemIndex > -1) {
      // Update existing item
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].subtotal = cart.items[existingItemIndex].quantity * price;
    } else {
      // Add new item
      cart.items.push({
        food: foodId,
        shop: shopId,
        quantity,
        price,
        subtotal
      });
    }

    await cart.save();

    // Populate cart for response
    await cart.populate('items.food', 'name price image category');
    await cart.populate('items.shop', 'name address');

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      data: cart
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding item to cart',
      error: error.message
    });
  }
});

// Update item quantity in cart
router.put('/update/:itemIndex', authenticateToken, async (req, res) => {
  try {
    const { itemIndex } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1'
      });
    }

    const cart = await Cart.findOne({ 
      user: req.user.id, 
      isCheckedOut: false 
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    if (itemIndex >= cart.items.length) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    // Update quantity and subtotal
    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].subtotal = cart.items[itemIndex].price * quantity;

    await cart.save();

    await cart.populate('items.food', 'name price image category');
    await cart.populate('items.shop', 'name address');

    res.json({
      success: true,
      message: 'Cart updated successfully',
      data: cart
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating cart',
      error: error.message
    });
  }
});

// Remove item from cart
router.delete('/remove/:itemIndex', authenticateToken, async (req, res) => {
  try {
    const { itemIndex } = req.params;

    const cart = await Cart.findOne({ 
      user: req.user.id, 
      isCheckedOut: false 
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    if (itemIndex >= cart.items.length) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    // Remove item
    cart.items.splice(itemIndex, 1);
    await cart.save();

    await cart.populate('items.food', 'name price image category');
    await cart.populate('items.shop', 'name address');

    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      data: cart
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing item from cart',
      error: error.message
    });
  }
});

// Clear entire cart
router.delete('/clear', authenticateToken, async (req, res) => {
  try {
    const cart = await Cart.findOne({ 
      user: req.user.id, 
      isCheckedOut: false 
    });

    if (!cart) {
      return res.json({
        success: true,
        message: 'Cart is already empty'
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      data: cart
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error clearing cart',
      error: error.message
    });
  }
});

// Get cart summary for checkout
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const cart = await Cart.findOne({ 
      user: req.user.id, 
      isCheckedOut: false 
    })
    .populate('items.food', 'name price image')
    .populate('items.shop', 'name address phone');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Group items by shop for better organization
    const itemsByShop = cart.items.reduce((acc, item) => {
      const shopId = item.shop._id.toString();
      if (!acc[shopId]) {
        acc[shopId] = {
          shop: item.shop,
          items: [],
          shopSubtotal: 0
        };
      }
      acc[shopId].items.push(item);
      acc[shopId].shopSubtotal += item.subtotal;
      return acc;
    }, {});

    const summary = {
      totalItems: cart.items.length,
      totalAmount: cart.totalAmount,
      itemsByShop: Object.values(itemsByShop),
      deliveryFee: 50, // You can make this dynamic
      taxes: Math.round(cart.totalAmount * 0.05), // 5% tax
      grandTotal: cart.totalAmount + 50 + Math.round(cart.totalAmount * 0.05)
    };

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating cart summary',
      error: error.message
    });
  }
});

// Process payment and create order
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const { 
      paymentMethod, 
      deliveryAddress, 
      phoneNumber,
      paymentDetails // For card payments
    } = req.body;

    // Validate required fields
    if (!paymentMethod || !deliveryAddress || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Payment method, delivery address, and phone number are required'
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ 
      user: req.user.id, 
      isCheckedOut: false 
    })
    .populate('items.food', 'name price image category')
    .populate('items.shop', 'name address phone');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Calculate totals
    const deliveryFee = 50;
    const taxes = Math.round(cart.totalAmount * 0.05);
    const grandTotal = cart.totalAmount + deliveryFee + taxes;

    // Simulate payment processing
    let paymentStatus = 'pending';
    let paymentId = null;

    if (paymentMethod === 'cod') {
      paymentStatus = 'pending';
      paymentId = `COD_${Date.now()}`;
    } else if (paymentMethod === 'card' || paymentMethod === 'upi') {
      // Here you would integrate with actual payment gateway
      // For now, we'll simulate successful payment
      paymentStatus = 'completed';
      paymentId = `PAY_${Date.now()}`;
    }

    // Create order
    const order = new Order({
      userId: req.user.id,
      shopId: cart.items[0].shop._id, // Assuming all items are from the same shop
      items: cart.items.map(item => ({
        foodId: item.food._id,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
        foodName: item.food.name
      })),
      totalAmount: cart.totalAmount,
      deliveryFee: deliveryFee,
      taxes: taxes,
      grandTotal: grandTotal,
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus,
      paymentId: paymentId,
      deliveryAddress: deliveryAddress,
      phoneNumber: phoneNumber,
      status: 'confirmed',
      deliveryTime: 45, // 45 minutes
      estimatedDeliveryTime: new Date(Date.now() + 45 * 60 * 1000) // 45 minutes from now
    });

    await order.save();

    // Mark cart as checked out
    cart.isCheckedOut = true;
    await cart.save();

    // Populate order for response
    await order.populate('userId', 'name email');
    await order.populate('items.foodId', 'name image category');
    await order.populate('shopId', 'name address phone');

    res.json({
      success: true,
      message: 'Order placed successfully!',
      data: {
        order: order,
        paymentStatus: paymentStatus,
        estimatedDelivery: order.estimatedDeliveryTime
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error processing checkout',
      error: error.message
    });
  }
});

// Get cart item count (for navigation badge)
router.get('/count', authenticateToken, async (req, res) => {
  try {
    const cart = await Cart.findOne({ 
      user: req.user.id, 
      isCheckedOut: false 
    });

    const count = cart ? cart.items.length : 0;

    res.json({
      success: true,
      data: { count }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching cart count',
      error: error.message
    });
  }
});

export default router;