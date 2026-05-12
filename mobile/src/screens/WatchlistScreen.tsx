import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

export default function WatchlistScreen({ navigation }: any) {
  const [watchlists, setWatchlists] = useState<any[]>([]);
  const [activeList, setActiveList] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get('/api/watchlist');
      setWatchlists(res.data || []);
    } catch (err) {
      console.error('Watchlist fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const removeFromWatchlist = async (symbol: string) => {
    const wl = watchlists[activeList];
    if (!wl) return;
    Alert.alert('Remove', `Remove ${symbol} from ${wl.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/watchlist/${wl.id}/items/${symbol}`);
            fetchData();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error || 'Failed to remove');
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

  const currentList = watchlists[activeList];
  const items: any[] = currentList?.items || [];

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.pageTitle}>Watchlist</Text>

      {/* Watchlist tabs */}
      {watchlists.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.listTabs}>
          {watchlists.map((wl, i) => (
            <TouchableOpacity
              key={wl.id}
              style={[styles.listTab, i === activeList && styles.listTabActive]}
              onPress={() => setActiveList(i)}
            >
              <Text style={[styles.listTabText, i === activeList && styles.listTabTextActive]}>
                {wl.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00B386" />}
        showsVerticalScrollIndicator={false}
      >
        {watchlists.length === 0 || items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⭐</Text>
            <Text style={styles.emptyTitle}>Watchlist is empty</Text>
            <Text style={styles.emptySubTitle}>
              Search for stocks in the Market tab and add them to your watchlist
            </Text>
          </View>
        ) : (
          items.map((item: any) => {
            const changePercent = item.changePercent || 0;
            const isPos = changePercent >= 0;
            return (
              <TouchableOpacity
                key={item.symbol}
                style={styles.itemRow}
                onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol, exchange: item.exchange || 'NSE' })}
                onLongPress={() => removeFromWatchlist(item.symbol)}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemSymbol}>{item.symbol}</Text>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name || item.symbol}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.itemPrice}>{formatCurrency(item.price || 0)}</Text>
                  <View style={[styles.changeBadge, { backgroundColor: isPos ? '#00B38622' : '#FF525222' }]}>
                    <Text style={[styles.changeBadgeText, { color: isPos ? '#00B386' : '#FF5252' }]}>
                      {isPos ? '+' : ''}{changePercent.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <Text style={styles.hint}>Long press a stock to remove it from watchlist</Text>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  pageTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  listTabs: { paddingHorizontal: 16, marginBottom: 10, flexGrow: 0 },
  listTab: {
    paddingHorizontal: 16, paddingVertical: 8, marginRight: 8,
    borderRadius: 20, backgroundColor: '#1e1e2e',
    borderWidth: 1, borderColor: '#2a2a3e',
  },
  listTabActive: { backgroundColor: '#00B386', borderColor: '#00B386' },
  listTabText: { color: '#888', fontSize: 13, fontWeight: '600' },
  listTabTextActive: { color: '#fff' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a2e',
  },
  itemSymbol: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  itemName: { fontSize: 12, color: '#666', maxWidth: 200 },
  itemPrice: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 4 },
  changeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  changeBadgeText: { fontSize: 12, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptySubTitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  hint: { textAlign: 'center', color: '#333', fontSize: 11, marginTop: 16 },
});
