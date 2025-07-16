// admin.js - Updated configuration with Cart resource and session fixes
import AdminJS, { ComponentLoader } from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Shop from '../models/shop.js';
import Food from '../models/Food.js';
import Order from '../models/Order.js';
import Review from '../models/Review.js';
import Cart from '../models/cart.js'; // <-- Import Cart

const AdminJSMongoose = await import('@adminjs/mongoose');
AdminJS.registerAdapter(AdminJSMongoose);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize ComponentLoader
const componentLoader = new ComponentLoader();

// Add Dashboard component
const DashboardComponent = componentLoader.add(
  'Dashboard',
  path.resolve(__dirname, '../components/Dashboard')
);

// Enhanced dashboard handler
const dashboardHandler = async (request, response, context) => {
  try {
    console.log('Dashboard handler called'); // Debug log

    // Get basic counts
    const [
      usersCount,
      shopsCount,
      foodsCount,
      ordersCount,
      reviewsCount,
      cartsCount,
    ] = await Promise.all([
      User.countDocuments(),
      Shop.countDocuments(),
      Food.countDocuments(),
      Order.countDocuments(),
      Review.countDocuments(),
      Cart.countDocuments(),
    ]);

    // Get time-based data
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);

    const [
      todayOrders,
      weeklyOrders,
      recentUsers,
      pendingOrders,
      activeCarts,
    ] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ createdAt: { $gte: startOfWeek } }),
      User.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Order.countDocuments({ status: { $in: ['pending', 'processing'] } }),
      Cart.countDocuments({ isCheckedOut: false }),
    ]);

    const dashboardData = {
      usersCount,
      shopsCount,
      foodsCount,
      ordersCount,
      reviewsCount,
      cartsCount,
      todayOrders,
      weeklyOrders,
      recentUsers,
      pendingOrders,
      activeCarts,
      lastUpdated: new Date().toISOString(),
    };

    console.log('Dashboard data:', dashboardData); // Debug log
    return dashboardData;

  } catch (error) {
    console.error('Dashboard handler error:', error);
    return {
      error: 'Failed to fetch dashboard data',
      usersCount: 0,
      shopsCount: 0,
      foodsCount: 0,
      ordersCount: 0,
      reviewsCount: 0,
      cartsCount: 0,
    };
  }
};

const adminJs = new AdminJS({
  rootPath: '/admin',
  componentLoader,

  // Resources configuration
  resources: [
    {
      resource: User,
      options: {
        navigation: { name: 'Users', icon: 'User' },
        properties: {
          password: { isVisible: false },
          createdAt: { isVisible: { list: true, filter: true, show: true, edit: false } },
          updatedAt: { isVisible: { list: true, filter: true, show: true, edit: false } }
        },
        listProperties: ['email', 'name', 'phone', 'createdAt'],
        filterProperties: ['email', 'name', 'createdAt'],
        sort: { sortBy: 'createdAt', direction: 'desc' }
      }
    },
    {
      resource: Shop,
      options: {
        navigation: { name: 'Shops', icon: 'Store' },
        listProperties: ['name', 'owner', 'location.coordinates', 'createdAt'],
        sort: { sortBy: 'createdAt', direction: 'desc' }
      }
    },
    {
      resource: Food,
      options: {
        navigation: { name: 'Foods', icon: 'Apple' },
        listProperties: ['name', 'menu_category', 'price', 'createdAt'],
        sort: { sortBy: 'createdAt', direction: 'desc' }
      }
    },
    {
      resource: Order,
      options: {
        navigation: { name: 'Orders', icon: 'ShoppingCart' },
        listProperties: ['userId', 'shopId', 'status', 'totalAmount', 'createdAt'],
        sort: { sortBy: 'createdAt', direction: 'desc' }
      }
    },
    {
      resource: Review,
      options: {
        navigation: { name: 'Feedback Reviews', icon: 'StarFilled' },
        listProperties: ['userId', 'shopId', 'rating', 'comment', 'createdAt'],
        sort: { sortBy: 'createdAt', direction: 'desc' }
      }
    },
    {
      resource: Cart, // <-- Add Cart model as resource
      options: {
        navigation: { name: 'Carts', icon: 'ShoppingBag' },
        properties: {
          user: { isVisible: { list: true, filter: true, show: true, edit: false } },
          items: { isArray: true },
          totalAmount: { isVisible: { list: true, filter: true, show: true, edit: false } },
          isCheckedOut: { isVisible: { list: true, filter: true, show: true, edit: true } },
          createdAt: { isVisible: { list: true, filter: true, show: true, edit: false } },
          updatedAt: { isVisible: { list: true, filter: true, show: true, edit: false } }
        },
        listProperties: ['user', 'totalAmount', 'isCheckedOut', 'createdAt'],
        filterProperties: ['user', 'isCheckedOut', 'createdAt'],
        sort: { sortBy: 'createdAt', direction: 'desc' }
      }
    },
  ],

  // Dashboard configuration
  dashboard: {
    component: DashboardComponent,
    handler: dashboardHandler,
  },

  // Branding and theme
  branding: {
    companyName: 'XpressBites Admin',
    logo: 'https://www.xpressbites.store/assets/img/logo.png',
    favicon: 'https://www.xpressbites.store/assets/img/logo.png',
    softwareBrothers: false,
    theme: {
      colors: {
        primary100: '#C2262D',
        primary80: '#A61F26',
        primary60: '#E74C51',
        primary40: '#F48A8D',
        primary20: '#F8D6D8',
        accent: '#1abc9c',
        filterBg: '#ffffff',
        border: '#ecf0f1',
        sidebarBg: '#2c3e50',
        sidebarColor: '#ecf0f1',
        bg: '#f8f9fa',
        defaultText: '#2d3436',
        lightText: '#95a5a6',
        success: '#27ae60',
        warning: '#f39c12',
        danger: '#e74c3c',
        info: '#3498db',
      },
      fonts: {
        base: '"Inter", sans-serif',
        headings: '"Poppins", sans-serif'
      }
    }
  },

  // Locale configuration
  locale: {
    language: 'en',
    availableLanguages: ['en'],
    translations: {
      en: {
        labels: {
          navigation: 'Navigation',
          dashboard: 'Dashboard',
        },
        messages: {
          welcome: 'Welcome to XpressBites Admin Panel',
        }
      }
    }
  }
});

// Authentication setup
const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'garvsharmxa@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'Garvgarv12@'
};

// Configure session with proper options to fix deprecation warnings
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/food_delivery',
  touchAfter: 24 * 3600 // lazy session update
});

const sessionOptions = {
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something stored
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
};

const adminRouter = AdminJSExpress.buildAuthenticatedRouter(adminJs, {
  authenticate: async (email, password) => {
    console.log('Authentication attempt:', email); // Debug log
    if (email === ADMIN.email && password === ADMIN.password) {
      return ADMIN;
    }
    return null;
  },
  cookieName: 'adminjs',
  cookiePassword: process.env.ADMIN_COOKIE_SECRET || 'secret-key-change-this-in-production'
}, null, sessionOptions); // Pass session options here to fix deprecation warnings

export { adminJs, adminRouter };