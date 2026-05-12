import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { formatCurrency } from '../lib/utils';

type OrderSide = 'BUY' | 'SELL';
type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';

export default function StockDetailScreen({ route, navigation }: any) {
  const { symbol, exchange = 'NSE' } = route.params;
  const user = useAuthStore((s) => s.user);

  const [quote, setQuote] = useState<any>(null);
  const [holding, setHolding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orderVisible, setOrderVisible] = useState(false);
  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [placing, setPlacing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [quoteRes, portfolioRes] = await Promise.all([
        api.get(`/api/stocks/${symbol}?exchange=${exchange}`),
        api.get('/api/portfolio'),
      ]);
      setQuote(quoteRes.data);
      const h = (portfolioRes.data?.holdings || []).find((x: any) => x.symbol === symbol);
      setHolding(h || null);
      if (!price) setPrice(String(quoteRes.data?.price || ''));
    } catch (err) {
      console.error('StockDetail fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, exchange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openOrder = (s: OrderSide) => {
    setSide(s);
    setOrderType('MARKET');
    setQuantity('1');
    setPrice(String(quote?.price || ''));
    setTriggerPrice('');
    setOrderVisible(true);
  };

  const placeOrder = async () => {
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) return Alert.alert('Error', 'Enter a valid quantity');
    if (orderType !== 'MARKET' && (!price || parseFloat(price) <= 0)) {
      return Alert.alert('Error', 'Enter a valid price');
    }
    if ((orderType === 'SL' || orderType === 'SL-M') && (!triggerPrice || parseFloat(triggerPrice) <= 0)) {
      return Alert.alert('Error', 'Enter a valid trigger price');
    }

    setPlacing(true);
    try {
      await api.post('/api/orders', {
        symbol,
        exchange,
        type: side,
        orderType,
        quantity: qty,
        price: orderType !== 'MARKET' ? parseFloat(price) : undefined,
        triggerPrice: (orderType === 'SL' || orderType === 'SL-M') ? parseFloat(triggerPrice) : undefined,
      });
      setOrderVisible(false);
      Alert.alert('Order Placed', `${side} order for ${qty} share(s) of ${symbol} placed successfully.`);
      fetchData();
    } catch (err: any) {
      Alert.alert('Order Failed', err?.response?.data?.error || 'Please try again');
    } finally {
      setPlacing(false);
    }
  };

  const estimatedTotal = (() => {
    const qty = parseInt(quantity, 10) || 0;
    const p = orderType === 'MARKET' ? (quote?.price || 0) : (parseFloat(price) || 0);
    return qty * p;
  })();

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00B386" />
      </View>
    );
  }

  if (!quote) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#888' }}>Could not load stock data</Text>
        </View>
      </SafeAreaView>
    );
  }

  const change = quote.change || 0;
  const changePercent = quote.changePercent || 0;
  const isPositive = changePercent >= 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.exchange}>{exchange}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Price section */}
        <View style={styles.priceSection}>
          <Text style={styles.stockName}>{quote.name || symbol}</Text>
          <Text style={styles.symbol}>{symbol}</Text>
          <Text style={styles.price}>{formatCurrency(quote.price)}</Text>
          <Text style={[styles.change, { color: isPositive ? '#00B386' : '#FF5252' }]}>
            {isPositive ? '+' : ''}{formatCurrency(change)}  ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
          </Text>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Open', value: formatCurrency(quote.open || 0) },
            { label: 'Prev Close', value: formatCurrency(quote.previousClose || quote.close || 0) },
            { label: 'Day High', value: formatCurrency(quote.dayHigh || quote.high || 0) },
            { label: 'Day Low', value: formatCurrency(quote.dayLow || quote.low || 0) },
            { label: '52W High', value: formatCurrency(quote.yearHigh || 0) },
            { label: '52W Low', value: formatCurrency(quote.yearLow || 0) },
            { label: 'Volume', value: quote.volume ? (quote.volume / 1000).toFixed(1) + 'K' : '—' },
            { label: 'Market Cap', value: quote.marketCap ? '₹' + (quote.marketCap / 1e9).toFixed(1) + 'B' : '—' },
          ].map((stat) => (
            <View key={stat.label} style={styles.statItem}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        {/* Your holding */}
        {holding && (
          <View style={styles.holdingCard}>
            <Text style={styles.holdingTitle}>Your Position</Text>
            <View style={styles.holdingRow}>
              <View>
                <Text style={styles.holdingLabel}>Qty</Text>
                <Text style={styles.holdingVal}>{holding.quantity}</Text>
              </View>
              <View>
                <Text style={styles.holdingLabel}>Avg Price</Text>
                <Text style={styles.holdingVal}>{formatCurrency(holding.avgBuyPrice)}</Text>
              </View>
              <View>
                <Text style={styles.holdingLabel}>P&L</Text>
                <Text style={[styles.holdingVal, { color: (holding.pnl || 0) >= 0 ? '#00B386' : '#FF5252' }]}>
                  {(holding.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(holding.pnl || 0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Buy / Sell buttons */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.buyBtn} onPress={() => openOrder('BUY')}>
          <Text style={styles.buyBtnText}>BUY</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sellBtn} onPress={() => openOrder('SELL')}>
          <Text style={styles.sellBtnText}>SELL</Text>
        </TouchableOpacity>
      </View>

      {/* Order Modal */}
      <Modal visible={orderVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {/* Side toggle */}
            <View style={styles.sideTabs}>
              <TouchableOpacity
                style={[styles.sideTab, side === 'BUY' && styles.sideTabBuy]}
                onPress={() => setSide('BUY')}
              >
                <Text style={[styles.sideTabText, side === 'BUY' && { color: '#fff' }]}>BUY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sideTab, side === 'SELL' && styles.sideTabSell]}
                onPress={() => setSide('SELL')}
              >
                <Text style={[styles.sideTabText, side === 'SELL' && { color: '#fff' }]}>SELL</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSymbol}>{symbol}</Text>
            <Text style={styles.modalCurrentPrice}>LTP: {formatCurrency(quote.price)}</Text>

            {/* Order type */}
            <Text style={styles.inputLabel}>Order Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {(['MARKET', 'LIMIT', 'SL', 'SL-M'] as OrderType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, orderType === t && styles.typeChipActive]}
                  onPress={() => setOrderType(t)}
                >
                  <Text style={[styles.typeChipText, orderType === t && styles.typeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Quantity */}
            <Text style={styles.inputLabel}>Quantity</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholderTextColor="#555"
            />

            {/* Price (for LIMIT / SL) */}
            {(orderType === 'LIMIT' || orderType === 'SL') && (
              <>
                <Text style={styles.inputLabel}>Price (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#555"
                />
              </>
            )}

            {/* Trigger price for SL / SL-M */}
            {(orderType === 'SL' || orderType === 'SL-M') && (
              <>
                <Text style={styles.inputLabel}>Trigger Price (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={triggerPrice}
                  onChangeText={setTriggerPrice}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#555"
                />
              </>
            )}

            {/* Summary */}
            <View style={styles.summaryRow}>
              {side === 'BUY' ? (
                <Text style={styles.summaryText}>Available: {formatCurrency(user?.balance || 0)}</Text>
              ) : (
                <Text style={styles.summaryText}>Holdings: {holding?.quantity || 0} qty</Text>
              )}
              <Text style={styles.summaryText}>Est. {formatCurrency(estimatedTotal)}</Text>
            </View>

            {/* Confirm */}
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: side === 'BUY' ? '#00B386' : '#FF5252' }, placing && { opacity: 0.6 }]}
              onPress={placeOrder}
              disabled={placing}
            >
              {placing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>{side === 'BUY' ? 'Place Buy Order' : 'Place Sell Order'}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setOrderVisible(false)}>
              <Text style={styles.cancelModalText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  backBtn: { padding: 4 },
  backText: { color: '#00B386', fontSize: 16, fontWeight: '600' },
  exchange: { color: '#888', fontSize: 13, fontWeight: '600' },
  priceSection: { paddingHorizontal: 20, paddingBottom: 20 },
  stockName: { fontSize: 14, color: '#888', marginBottom: 2 },
  symbol: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  price: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  change: { fontSize: 15, fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1e1e2e', borderRadius: 16,
    borderWidth: 1, borderColor: '#2a2a3e', overflow: 'hidden',
  },
  statItem: { width: '50%', padding: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a3e' },
  statLabel: { fontSize: 11, color: '#666', marginBottom: 4 },
  statValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
  holdingCard: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1e3328', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#00B38633',
  },
  holdingTitle: { fontSize: 13, color: '#00B386', fontWeight: '700', marginBottom: 12 },
  holdingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  holdingLabel: { fontSize: 11, color: '#666', marginBottom: 4 },
  holdingVal: { fontSize: 14, fontWeight: '700', color: '#fff' },
  actionBar: {
    flexDirection: 'row', padding: 16, gap: 12,
    backgroundColor: '#0f0f1a', borderTopWidth: 1, borderTopColor: '#1a1a2e',
  },
  buyBtn: {
    flex: 1, backgroundColor: '#00B386', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  buyBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  sellBtn: {
    flex: 1, backgroundColor: '#FF5252', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  sellBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' },
  modalSheet: {
    backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingTop: 12,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: '#333', borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  sideTabs: { flexDirection: 'row', marginBottom: 16, gap: 10 },
  sideTab: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#2a2a3e', alignItems: 'center',
    borderWidth: 1, borderColor: '#3a3a4e',
  },
  sideTabBuy: { backgroundColor: '#00B386', borderColor: '#00B386' },
  sideTabSell: { backgroundColor: '#FF5252', borderColor: '#FF5252' },
  sideTabText: { fontSize: 15, fontWeight: 'bold', color: '#888' },
  modalSymbol: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 2 },
  modalCurrentPrice: { fontSize: 13, color: '#888', marginBottom: 16 },
  inputLabel: { fontSize: 12, color: '#888', marginBottom: 6 },
  input: {
    backgroundColor: '#2a2a3e', color: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 14,
    borderWidth: 1, borderColor: '#3a3a4e',
  },
  typeChip: {
    paddingHorizontal: 16, paddingVertical: 8, marginRight: 8,
    borderRadius: 20, backgroundColor: '#2a2a3e',
    borderWidth: 1, borderColor: '#3a3a4e',
  },
  typeChipActive: { backgroundColor: '#00B386', borderColor: '#00B386' },
  typeChipText: { color: '#888', fontSize: 13, fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  summaryText: { fontSize: 13, color: '#888' },
  confirmBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelModalBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelModalText: { color: '#888', fontSize: 14 },
});
