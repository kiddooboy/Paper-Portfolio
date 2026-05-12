import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { formatCurrency, formatPercent } from '../lib/utils';

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const logout = useAuthStore((s) => s.logout);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [indices, setIndices] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [portfolioRes, indicesRes, balanceRes] = await Promise.all([
        api.get('/api/portfolio/summary'),
        api.get('/api/market/indices'),
        api.get('/api/wallet/balance'),
      ]);
      setPortfolio(portfolioRes.data);
      setIndices(indicesRes.data || []);
      if (balanceRes.data?.balance !== undefined) {
        updateBalance(balanceRes.data.balance);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00B386" />
      </View>
    );
  }

  const totalValue = (user?.balance || 0) + (portfolio?.totalInvested || 0);
  const pnl = portfolio?.totalPnl || 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00B386" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning,</Text>
            <Text style={styles.userName}>{user?.name || 'Trader'}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name ? getInitials(user.name) : 'U'}</Text>
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(user?.balance || 0)}</Text>
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceSub}>Invested</Text>
              <Text style={styles.balanceSubVal}>{formatCurrency(portfolio?.totalInvested || 0)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View>
              <Text style={styles.balanceSub}>Total P&L</Text>
              <Text style={[styles.balanceSubVal, { color: pnl >= 0 ? '#00B386' : '#FF5252' }]}>
                {formatPercent(pnl)}
              </Text>
            </View>
            <View style={styles.balanceDivider} />
            <View>
              <Text style={styles.balanceSub}>Portfolio Value</Text>
              <Text style={styles.balanceSubVal}>{formatCurrency(totalValue)}</Text>
            </View>
          </View>
        </View>

        {/* Indices */}
        {indices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Indices</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {indices.map((idx: any) => (
                <View key={idx.symbol} style={styles.indexCard}>
                  <Text style={styles.indexName}>{idx.name || idx.symbol}</Text>
                  <Text style={styles.indexPrice}>{formatCurrency(idx.price)}</Text>
                  <Text style={[styles.indexChange, { color: idx.change >= 0 ? '#00B386' : '#FF5252' }]}>
                    {formatPercent(idx.changePercent || 0)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
  greeting: { fontSize: 13, color: '#888' },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#00B386', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  balanceCard: {
    margin: 16, marginTop: 4,
    backgroundColor: '#1e1e2e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  balanceLabel: { fontSize: 13, color: '#888', marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceSub: { fontSize: 11, color: '#666', marginBottom: 2 },
  balanceSubVal: { fontSize: 13, fontWeight: '600', color: '#fff' },
  balanceDivider: { width: 1, height: 30, backgroundColor: '#2a2a3e' },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  indexCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 14,
    marginRight: 10,
    minWidth: 130,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  indexName: { fontSize: 12, color: '#888', marginBottom: 4 },
  indexPrice: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 2 },
  indexChange: { fontSize: 12, fontWeight: '600' },
});
