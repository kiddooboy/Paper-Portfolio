import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

export default function PortfolioScreen({ navigation }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get('/api/portfolio');
      setData(res.data);
    } catch (err) {
      console.error('Portfolio fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00B386" />
      </View>
    );
  }

  const holdings: any[] = data?.holdings || [];
  const totalInvested: number = data?.totalInvested || 0;
  const totalCurrentValue: number = data?.totalCurrentValue || 0;
  const totalPnl: number = data?.totalPnl || 0;
  const totalPnlPercent: number = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00B386" />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Portfolio</Text>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Text style={styles.summaryLabel}>Current Value</Text>
            <Text style={styles.summaryBig}>{formatCurrency(totalCurrentValue)}</Text>
            <Text style={[styles.summaryPnl, { color: totalPnl >= 0 ? '#00B386' : '#FF5252' }]}>
              {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
              {'  '}({totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%)
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Invested</Text>
              <Text style={styles.summaryItemVal}>{formatCurrency(totalInvested)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Stocks</Text>
              <Text style={styles.summaryItemVal}>{holdings.length}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Day P&L</Text>
              <Text style={[styles.summaryItemVal, { color: (data?.dayPnl || 0) >= 0 ? '#00B386' : '#FF5252' }]}>
                {(data?.dayPnl || 0) >= 0 ? '+' : ''}{formatCurrency(data?.dayPnl || 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Holdings list */}
        <Text style={styles.sectionTitle}>Holdings</Text>

        {holdings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💼</Text>
            <Text style={styles.emptyTitle}>No holdings yet</Text>
            <Text style={styles.emptySubTitle}>Buy stocks from the Market tab to start building your portfolio</Text>
          </View>
        ) : (
          holdings.map((h: any) => {
            const invested = (h.avgBuyPrice || 0) * (h.quantity || 0);
            const currentVal = h.currentValue || (h.currentPrice || 0) * (h.quantity || 0);
            const pnl = h.pnl ?? (currentVal - invested);
            const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

            return (
              <TouchableOpacity
                key={h.symbol}
                style={styles.holdingCard}
                onPress={() => navigation.navigate('StockDetail', { symbol: h.symbol, exchange: h.exchange || 'NSE' })}
                activeOpacity={0.7}
              >
                <View style={styles.holdingTop}>
                  <View style={styles.holdingLeft}>
                    <Text style={styles.holdingSymbol}>{h.symbol}</Text>
                    <Text style={styles.holdingMeta}>
                      {h.quantity} qty · Avg ₹{(h.avgBuyPrice || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.holdingRight}>
                    <Text style={styles.holdingValue}>{formatCurrency(currentVal)}</Text>
                    <Text style={[styles.holdingPnl, { color: pnl >= 0 ? '#00B386' : '#FF5252' }]}>
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                    </Text>
                  </View>
                </View>
                {/* Progress bar */}
                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, Math.abs(pnlPct))}%` as any,
                        backgroundColor: pnl >= 0 ? '#00B386' : '#FF5252',
                      },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  pageTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  summaryCard: {
    margin: 16, marginTop: 0,
    backgroundColor: '#1e1e2e', borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: '#2a2a3e',
  },
  summaryTop: { marginBottom: 20 },
  summaryLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  summaryBig: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  summaryPnl: { fontSize: 14, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryItemLabel: { fontSize: 11, color: '#666', marginBottom: 4 },
  summaryItemVal: { fontSize: 13, fontWeight: '700', color: '#fff' },
  divider: { width: 1, height: 30, backgroundColor: '#2a2a3e' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', paddingHorizontal: 16, marginBottom: 10 },
  holdingCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#1e1e2e', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#2a2a3e',
  },
  holdingTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  holdingLeft: {},
  holdingRight: { alignItems: 'flex-end' },
  holdingSymbol: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  holdingMeta: { fontSize: 12, color: '#666' },
  holdingValue: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 4 },
  holdingPnl: { fontSize: 12, fontWeight: '600' },
  progressBg: { height: 3, backgroundColor: '#2a2a3e', borderRadius: 2 },
  progressFill: { height: 3, borderRadius: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptySubTitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
});
