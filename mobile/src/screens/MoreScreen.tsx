import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

type LeaderEntry = {
  rank: number;
  userId: number;
  name: string;
  totalPnlPercent: number;
  totalPnl: number;
};

const getInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

export default function MoreScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingLB, setLoadingLB] = useState(true);
  const [loadingTX, setLoadingTX] = useState(true);
  const [section, setSection] = useState<'leaderboard' | 'transactions'>('leaderboard');

  useEffect(() => {
    api.get('/api/leaderboard')
      .then((r) => setLeaderboard(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingLB(false));

    api.get('/api/wallet/transactions')
      .then((r) => setTransactions(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingTX(false));
  }, []);

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const medal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name ? getInitials(user.name) : 'U'}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.profileName}>{user?.name || 'Trader'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* Balance */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(user?.balance || 0)}</Text>
        </View>

        {/* Quick links */}
        <View style={styles.linksGrid}>
          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => navigation.navigate('Watchlist')}
          >
            <Text style={styles.linkIcon}>⭐</Text>
            <Text style={styles.linkLabel}>Watchlist</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => setSection('leaderboard')}
          >
            <Text style={styles.linkIcon}>🏆</Text>
            <Text style={styles.linkLabel}>Leaderboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => setSection('transactions')}
          >
            <Text style={styles.linkIcon}>💳</Text>
            <Text style={styles.linkLabel}>Transactions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => navigation.navigate('Market')}
          >
            <Text style={styles.linkIcon}>📈</Text>
            <Text style={styles.linkLabel}>Market</Text>
          </TouchableOpacity>
        </View>

        {/* Section toggle */}
        <View style={styles.sectionTabs}>
          <TouchableOpacity
            style={[styles.sectionTab, section === 'leaderboard' && styles.sectionTabActive]}
            onPress={() => setSection('leaderboard')}
          >
            <Text style={[styles.sectionTabText, section === 'leaderboard' && styles.sectionTabTextActive]}>
              Leaderboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sectionTab, section === 'transactions' && styles.sectionTabActive]}
            onPress={() => setSection('transactions')}
          >
            <Text style={[styles.sectionTabText, section === 'transactions' && styles.sectionTabTextActive]}>
              Transactions
            </Text>
          </TouchableOpacity>
        </View>

        {/* Leaderboard */}
        {section === 'leaderboard' && (
          loadingLB ? (
            <ActivityIndicator color="#00B386" style={{ marginTop: 24 }} />
          ) : (
            leaderboard.map((entry) => (
              <View key={entry.userId} style={styles.lbRow}>
                <Text style={styles.lbRank}>{medal(entry.rank)}</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.lbName}>{entry.name}</Text>
                  <Text style={styles.lbPnl}>{formatCurrency(entry.totalPnl)}</Text>
                </View>
                <Text style={[styles.lbPct, { color: entry.totalPnlPercent >= 0 ? '#00B386' : '#FF5252' }]}>
                  {entry.totalPnlPercent >= 0 ? '+' : ''}{entry.totalPnlPercent.toFixed(2)}%
                </Text>
              </View>
            ))
          )
        )}

        {/* Transactions */}
        {section === 'transactions' && (
          loadingTX ? (
            <ActivityIndicator color="#00B386" style={{ marginTop: 24 }} />
          ) : transactions.length === 0 ? (
            <Text style={styles.emptyText}>No transactions yet</Text>
          ) : (
            transactions.slice(0, 30).map((tx: any, i: number) => (
              <View key={i} style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txDesc}>{tx.description || tx.type}</Text>
                  <Text style={styles.txDate}>
                    {new Date(tx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: tx.amount > 0 ? '#00B386' : '#FF5252' }]}>
                  {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                </Text>
              </View>
            ))
          )
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, marginBottom: 10,
    backgroundColor: '#1e1e2e', borderRadius: 20,
    padding: 16, borderWidth: 1, borderColor: '#2a2a3e',
  },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#00B386', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  profileName: { fontSize: 17, fontWeight: 'bold', color: '#fff', marginBottom: 3 },
  profileEmail: { fontSize: 12, color: '#666' },
  logoutBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: '#FF5252',
  },
  logoutText: { color: '#FF5252', fontSize: 13, fontWeight: '600' },
  balanceCard: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1e1e2e', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#2a2a3e',
  },
  balanceLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  balanceAmount: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  linksGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, marginBottom: 16, gap: 8,
  },
  linkCard: {
    width: '47%', backgroundColor: '#1e1e2e',
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#2a2a3e',
    alignItems: 'center',
  },
  linkIcon: { fontSize: 28, marginBottom: 8 },
  linkLabel: { fontSize: 13, color: '#fff', fontWeight: '600' },
  sectionTabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 8 },
  sectionTab: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#1e1e2e', alignItems: 'center',
    borderWidth: 1, borderColor: '#2a2a3e',
  },
  sectionTabActive: { backgroundColor: '#00B386', borderColor: '#00B386' },
  sectionTabText: { color: '#888', fontSize: 13, fontWeight: '600' },
  sectionTabTextActive: { color: '#fff' },
  lbRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a2e',
  },
  lbRank: { fontSize: 22, width: 36, textAlign: 'center' },
  lbName: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 2 },
  lbPnl: { fontSize: 12, color: '#666' },
  lbPct: { fontSize: 15, fontWeight: '700' },
  txRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a2e',
  },
  txDesc: { fontSize: 14, color: '#fff', marginBottom: 3 },
  txDate: { fontSize: 11, color: '#555' },
  txAmount: { fontSize: 14, fontWeight: '700' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 32, fontSize: 14 },
});
