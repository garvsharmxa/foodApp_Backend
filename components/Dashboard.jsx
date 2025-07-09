// components/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';

import {
  Box,
  H2,
  H3,
  Text,
  Illustration,
  Card,
  Badge,
  Loader,
  Button,
} from '@adminjs/design-system';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const api = new ApiClient();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching dashboard data...');
      
      const response = await api.getDashboard();
      console.log('Dashboard response:', response);
      
      setData(response.data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Dashboard data fetch error:', err);
      setError('Failed to load dashboard data');
      // Set fallback data for development
      setData({
        usersCount: 0,
        shopsCount: 0,
        foodsCount: 0,
        ordersCount: 0,
        reviewsCount: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getCardData = () => {
    if (!data) return [];
    
    return [
      {
        title: 'Total Users',
        count: data.usersCount || 0,
        description: 'Registered users in the system',
        icon: '👥',
        badge: { text: 'Active', variant: 'success' },
        bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        route: '/admin/resources/User',
      },
      {
        title: 'Active Shops',
        count: data.shopsCount || 0,
        description: 'Vendor shops currently active',
        icon: '🏪',
        badge: { text: 'Online', variant: 'info' },
        bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        route: '/admin/resources/Shop',
      },
      {
        title: 'Food Items',
        count: data.foodsCount || 0,
        description: 'Available menu items',
        icon: '🍽️',
        badge: { text: 'Available', variant: 'success' },
        bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        route: '/admin/resources/Food',
      },
      {
        title: 'Total Orders',
        count: data.ordersCount || 0,
        description: 'Orders placed to date',
        icon: '🛒',
        badge: { text: 'Processing', variant: 'warning' },
        bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        route: '/admin/resources/Order',
      },
      {
        title: 'Customer Reviews',
        count: data.reviewsCount || 0,
        description: 'Total feedback received',
        icon: '⭐',
        badge: { text: 'Recent', variant: 'info' },
        bg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        route: '/admin/resources/Review',
      },
    ];
  };

  const handleCardClick = (route) => {
    if (route) {
      window.location.href = route;
    }
  };

  const getQuickStats = () => {
    if (!data) return null;
    
    const totalItems = (data.usersCount || 0) + (data.shopsCount || 0) + (data.foodsCount || 0) + (data.ordersCount || 0) + (data.reviewsCount || 0);
    const avgOrdersPerShop = (data.shopsCount || 0) > 0 ? Math.round((data.ordersCount || 0) / data.shopsCount) : 0;
    const avgReviewsPerFood = (data.foodsCount || 0) > 0 ? Math.round((data.reviewsCount || 0) / data.foodsCount) : 0;

    return { totalItems, avgOrdersPerShop, avgReviewsPerFood };
  };

  const quickStats = getQuickStats();

  if (loading) {
    return (
      <Box
        p="xxl"
        minHeight="100vh"
        bg="white"
        display="flex"
        justifyContent="center"
        alignItems="center"
      >
        <Loader />
      </Box>
    );
  }

  if (error && !data) {
    return (
      <Box
        p="xxl"
        minHeight="100vh"
        bg="white"
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
      >
        <Text color="danger" mb="lg">{error}</Text>
        <Button onClick={fetchDashboardData} variant="primary">
          🔄 Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box
      p="xxl"
      minHeight="100vh"
      bg="white"
    >
      {/* Header Section */}
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        textAlign="center"
        mb="xxl"
      >
        <Box mb="lg">
          <img 
            src="https://www.xpressbites.store/assets/img/logo.png" 
            alt="XpressBites Logo"
            style={{ width: '120px', height: 'auto' }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </Box>
        <Illustration variant="Rocket" width={200} />
        <H2 mt="xl" mb="md" color="primary100">
          Welcome to XpressBites Admin Panel
        </H2>
        <Text mb="lg" color="grey60" fontSize="lg">
          Manage users, vendors, food items, orders, and customer reviews — all in one place.
        </Text>
        <Box display="flex" alignItems="center" gap="sm">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={fetchDashboardData}
            disabled={loading}
          >
            🔄 Refresh Data
          </Button>
          {lastUpdated && (
            <Text fontSize="sm" color="grey40">
              Last updated: {lastUpdated}
            </Text>
          )}
        </Box>
      </Box>

      {/* Quick Stats Section */}
      {quickStats && (
        <Box mb="xxl">
          <H3 mb="lg" color="grey80">
            📊 Quick Statistics
          </H3>
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))"
            gap="lg"
          >
            <Card p="lg" style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 20%)',
              color: 'white',
              borderRadius: '12px'
            }}>
              <Text fontSize="sm" style={{ opacity: 0.8 }}>Total Database Records</Text>
              <H3 mt="sm">{quickStats.totalItems.toLocaleString()}</H3>
            </Card>
            <Card p="lg" style={{
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 20%)',
              color: 'white',
              borderRadius: '12px'
            }}>
              <Text fontSize="sm" style={{ opacity: 0.8 }}>Avg Orders per Shop</Text>
              <H3 mt="sm">{quickStats.avgOrdersPerShop}</H3>
            </Card>
            <Card p="lg" style={{
              background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 20%)',
              color: 'white',
              borderRadius: '12px'
            }}>
              <Text fontSize="sm" style={{ opacity: 0.8 }}>Avg Reviews per Item</Text>
              <H3 mt="sm">{quickStats.avgReviewsPerFood}</H3>
            </Card>
          </Box>
        </Box>
      )}

      {/* Main Cards Section */}
      <Box>
        <H3 mb="lg" color="grey80">🎛️ Management Overview</H3>
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(280px, 1fr))"
          gap="xl"
        >
          {getCardData().map((item, index) => (
            <Card
              key={index}
              p="xl"
              style={{
                background: item.bg,
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                color: '#fff',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                border: 'none',
                borderRadius: '16px',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 15px 40px rgba(0,0,0,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
              }}
              onClick={() => handleCardClick(item.route)}
            >
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb="lg">
                <Box>
                  <Text fontSize="3xl">{item.icon}</Text>
                </Box>
                <Badge variant={item.badge.variant} style={{ background: 'rgba(255,255,255,0.2)' }}>
                  {item.badge.text}
                </Badge>
              </Box>
              
              <Box>
                <Text fontSize="3xl" fontWeight="bold" mb="xs">
                  {item.count.toLocaleString()}
                </Text>
                <Text fontSize="lg" fontWeight="semibold" mb="sm" style={{ opacity: 0.9 }}>
                  {item.title}
                </Text>
                <Text fontSize="sm" style={{ opacity: 0.7, lineHeight: '1.5' }}>
                  {item.description}
                </Text>
              </Box>
              
              <Box mt="lg" display="flex" alignItems="center" style={{ opacity: 0.6 }}>
                <Text fontSize="xs">Click to manage →</Text>
              </Box>
            </Card>
          ))}
        </Box>
      </Box>

      {/* Additional Metrics */}
      {data && (data.todayOrders || data.weeklyOrders || data.recentUsers) && (
        <Box mt="xxl">
          <H3 mb="lg" color="grey80">📈 Recent Activity</H3>
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))"
            gap="lg"
          >
            {data.todayOrders !== undefined && (
              <Card p="lg" bg="white" style={{ border: '1px solid #ecf0f1', borderRadius: '12px' }}>
                <Text fontSize="sm" color="grey60">Today's Orders</Text>
                <H3 mt="sm" color="primary100">{data.todayOrders}</H3>
              </Card>
            )}
            {data.weeklyOrders !== undefined && (
              <Card p="lg" bg="white" style={{ border: '1px solid #ecf0f1', borderRadius: '12px' }}>
                <Text fontSize="sm" color="grey60">This Week's Orders</Text>
                <H3 mt="sm" color="accent">{data.weeklyOrders}</H3>
              </Card>
            )}
            {data.recentUsers !== undefined && (
              <Card p="lg" bg="white" style={{ border: '1px solid #ecf0f1', borderRadius: '12px' }}>
                <Text fontSize="sm" color="grey60">New Users This Week</Text>
                <H3 mt="sm" color="info">{data.recentUsers}</H3>
              </Card>
            )}
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box mt="xxl" textAlign="center" py="lg" style={{ borderTop: '1px solid #ecf0f1' }}>
        <Text fontSize="sm" color="grey40">
          XpressBites Admin Dashboard • Built with AdminJS
        </Text>
      </Box>
    </Box>
  );
};

export default Dashboard;