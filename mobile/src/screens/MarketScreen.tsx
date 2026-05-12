import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { formatCurrency, formatPercent } from '../lib/utils';

type Stock = {
  symbol: string;
  name?: string;
  exchange?: string;
  price: number;
  change?: number;
  changePercent: number;
};

type Tab = 'gainers' | 'losers' | 'search';

export default function MarketScreen({ navigation }: any) {
  const [indices, setIndices] = useState<any[]>([]);
  const [gainers, setGainers] = useState<Stock[]>([]);
  const [losers, setLosers] = useState<Stock[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('gainers');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);

  const fetchData = async () => {
    try {
      const [indicesRes, gainersRes, losersRes] = await Promise.all([
        api.get('/api/market/indices'),
        api.get('/api/stocks/gainers'),
        api.get('/api/stocks/losers'),
      ]);
      setIndices(indicesRes.data || []);
      setGainers(gainersRes.data || []);
      setLosers(losersRes.data || []);
    } catch (err) {
      console.error('Market fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(text)}`);
      setSearchResults(res.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const goToStock = (symbol: string, exchange = 'NSE') =>
    navigation.navigate('StockDetail', { symbol, exchange });

  const StockRow = ({ item }: { item: Stock }) => (
    <TouchableOpacity
      style={styles.stockRow}
      onPress={() => goToStock(item.symbol, item.exchange || 'NSE')}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.stockSymbol}>{item.symbol}</Text>
        <Text style={styles.stockName} numberOfLines={1}>{item.name || item.symbol}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.stockPrice}>{formatCurrency(item.price)}</Text>
        <Text style={[styles.stockChange, { color: item.changePercent >= 0 ? '#00B386' : '#FF5252' }]}>
          {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00B386" />
      </View>
    );
  }

  const listData = tab === 'gainers' ? gainers : losers;

  return (
    <SafeAreaView style={styles.container}>
      {/* Indices horizontal scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.indicesRow}>
        {indices.map((idx: any) => (
          <View key={idx.symbol} style={styles.indexCard}>
            <Text style={styles.indexName}>{idx.name || idx.symbol}</Text>
            <Text style={styles.indexPrice}>{formatCurrency(idx.price)}</Text>
            <Text style={[styles.indexChange, { color: (idx.changePercent || 0) >= 0 ? '#00B386' : '#FF5252' }]}>
              {(idx.changePercent || 0) >= 0 ? '+' : ''}{(idx.changePercent || 0).toFixed(2)}%
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Search bar */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search stocks..."
          placeholderTextColor="#555"
          value={query}
          onChangeText={handleSearch}
          onFocus={() => setTab('search')}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); setTab('gainers'); }}>
            <Text style={{ color: '#555', fontSize: 18, paddingRight: 8 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      {tab !== 'search' && (
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'gainers' && styles.tabActive]}
            onPress={() => setTab('gainers')}
          >
            <Text style={[styles.tabText, tab === 'gainers' && styles.tabTextActive]}>Top Gainers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'losers' && styles.tabActive]}
            onPress={() => setTab('losers')}
          >
            <Text style={[styles.tabText, tab === 'losers' && styles.tabTextActive]}>Top Losers</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stock list */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00B386" />}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'search' ? (
          searching ? (
            <ActivityIndicator color="#00B386" style={{ marginTop: 40 }} />
          ) : searchResults.length === 0 && query.length >= 2 ? (
            <Text style={styles.emptyText}>No results for "{query}"</Text>
          ) : (
            searchResults.map((item, i) => <StockRow key={i} item={item} />)
          )
        ) : (
          listData.map((item, i) => <StockRow key={i} item={item} />)
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  indicesRow: { paddingHorizontal: 12, paddingVertical: 12, flexGrow: 0 },
  indexCard: {
    backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14,
    marginRight: 10, minWidth: 130, borderWidth: 1, borderColor: '#2a2a3e',
  },
  indexName: { fontSize: 11, color: '#888', marginBottom: 4 },
  indexPrice: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  indexChange: { fontSize: 12, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e1e2e', borderRadius: 12,
    marginHorizontal: 16, marginBottom: 12,
    paddingHorizontal: 12, borderWidth: 1, borderColor: '#2a2a3e',
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 12 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#1e1e2e',
    borderWidth: 1, borderColor: '#2a2a3e',
  },
  tabActive: { backgroundColor: '#00B386', borderColor: '#00B386' },
  tabText: { color: '#888', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  stockRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a2e',
  },
  stockSymbol: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  stockName: { fontSize: 12, color: '#666', maxWidth: 200 },
  stockPrice: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  stockChange: { fontSize: 12, fontWeight: '600' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 14 },
});
