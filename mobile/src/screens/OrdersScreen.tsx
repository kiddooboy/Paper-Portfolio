import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

type Order = {
  id: number;
  symbol: string;
  exchange: string;
  type: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'REJECTED';
  quantity: number;
  price?: number;
  executedPrice?: number;
  createdAt: string;
  stockName?: string;
};

const STATUS_COLORS: Record<string, string> = {
  EXECUTED: '#00B386',
  PENDING: '#F5A623',
  CANCELLED: '#666',
  REJECTED: '#FF5252',
};

export default function OrdersScreen({ navigation }: any) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'EXECUTED' | 'CANCELLED'>('ALL');

  const fetchOrders = async () => {
    try {
      const res = await api.get('/api/orders');
      setOrders(res.data || []);
    } catch (err) {
      console.error('Orders fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchOrders(); };

  const cancelOrder = async (id: number) => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/api/orders/${id}/cancel`);
            fetchOrders();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error || 'Failed to cancel order');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00B386" />
      </View>
    );
  }

  const filtered = filter === 'ALL' ? orders : orders.filter((o) => o.status === filter);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.pageTitle}>Orders</Text>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {(['ALL', 'PENDING', 'EXECUTED', 'CANCELLED'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00B386" />}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubTitle}>Your orders will appear here after you buy or sell stocks</Text>
          </View>
        ) : (
          filtered.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => navigation.navigate('StockDetail', { symbol: order.symbol, exchange: order.exchange })}
              activeOpacity={0.8}
            >
              <View style={styles.orderTop}>
                <View style={styles.orderLeft}>
                  <View style={styles.orderSymbolRow}>
                    <Text style={[styles.orderTypeBadge, { backgroundColor: order.type === 'BUY' ? '#00B38622' : '#FF525222' }]}>
                      <Text style={{ color: order.type === 'BUY' ? '#00B386' : '#FF5252' }}>
                        {order.type}
                      </Text>
                    </Text>
                    <Text style={styles.orderSymbol}>{order.symbol}</Text>
                  </View>
                  <Text style={styles.orderMeta}>
                    {order.orderType} · {order.quantity} qty
                  </Text>
                </View>
                <View style={styles.orderRight}>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] }]}>
                      {order.status}
                    </Text>
                  </View>
                  <Text style={styles.orderPrice}>
                    {formatCurrency(order.executedPrice || order.price || 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.orderBottom}>
                <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
                {order.status === 'PENDING' && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => cancelOrder(order.id)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  pageTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  filterRow: { paddingHorizontal: 16, marginBottom: 12, flexGrow: 0 },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 8, marginRight: 8,
    borderRadius: 20, backgroundColor: '#1e1e2e',
    borderWidth: 1, borderColor: '#2a2a3e',
  },
  filterTabActive: { backgroundColor: '#00B386', borderColor: '#00B386' },
  filterText: { color: '#888', fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  orderCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#1e1e2e', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#2a2a3e',
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  orderLeft: {},
  orderRight: { alignItems: 'flex-end' },
  orderSymbolRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  orderTypeBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, marginRight: 8, fontSize: 11, fontWeight: '700',
  },
  orderSymbol: { fontSize: 16, fontWeight: '700', color: '#fff' },
  orderMeta: { fontSize: 12, color: '#666' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  orderPrice: { fontSize: 14, fontWeight: '700', color: '#fff' },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderDate: { fontSize: 11, color: '#555' },
  cancelBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: '#FF5252',
  },
  cancelBtnText: { color: '#FF5252', fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptySubTitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
});
