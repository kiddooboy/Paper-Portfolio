import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useAuthStore } from '../store/authStore';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import MarketScreen from '../screens/MarketScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import OrdersScreen from '../screens/OrdersScreen';
import MoreScreen from '../screens/MoreScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import StockDetailScreen from '../screens/StockDetailScreen';

const Root = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: '📊',
    Market: '📈',
    Portfolio: '💼',
    Orders: '📋',
    More: '☰',
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {icons[label] || '•'}
    </Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#2a2a3e', height: 60 },
        tabBarActiveTintColor: '#00B386',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: { fontSize: 11, marginBottom: 4 },
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Market" component={MarketScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <NavigationContainer>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Root.Screen name="Main" component={MainTabs} />
            <Root.Screen
              name="StockDetail"
              component={StockDetailScreen}
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
            <Root.Screen
              name="Watchlist"
              component={WatchlistScreen}
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
          </>
        ) : (
          <>
            <Root.Screen name="Login" component={LoginScreen} />
            <Root.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
