import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      return Alert.alert('Error', 'Please fill in all fields');
    }
    if (password.length < 6) {
      return Alert.alert('Error', 'Password must be at least 6 characters');
    }
    setLoading(true);
    try {
      const res = await api.post('/api/auth/register', {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
      });
      login(res.data.user, res.data.token);
    } catch (err: any) {
      Alert.alert('Registration Failed', err?.response?.data?.error || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const { data } = await GoogleSignin.signIn();
      const googleCredential = auth.GoogleAuthProvider.credential(data!.idToken);
      const result = await auth().signInWithCredential(googleCredential);
      const idToken = await result.user.getIdToken();
      const res = await api.post('/api/auth/firebase', { idToken });
      login(res.data.user, res.data.token);
    } catch (err: any) {
      console.error('[google-auth]', err?.code, err?.message);
      Alert.alert('Google Sign-In Failed', err?.response?.data?.error || err?.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start with ₹1,00,000 virtual balance</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />

        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, { paddingRight: 50, marginBottom: 0 }]}
            placeholder="Password (min 6 characters)"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(!showPw)}>
            <Text style={styles.eyeText}>{showPw ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Create Account</Text>}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.linkText}>Already have an account? </Text>
          <Text style={styles.linkBold}>Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  inner: { padding: 24, justifyContent: 'center', flexGrow: 1 },
  title: { fontSize: 34, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 32 },
  inputWrapper: { position: 'relative', marginBottom: 12 },
  input: {
    backgroundColor: '#1e1e2e',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    marginBottom: 12,
  },
  eyeBtn: { position: 'absolute', right: 14, top: 14 },
  eyeText: { fontSize: 18 },
  button: {
    backgroundColor: '#00B386',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2a2a3e' },
  dividerText: { color: '#555', marginHorizontal: 12, fontSize: 13 },
  googleButton: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    marginBottom: 24,
  },
  googleIcon: { color: '#4285F4', fontWeight: 'bold', fontSize: 18, marginRight: 10 },
  googleButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  linkRow: { flexDirection: 'row', justifyContent: 'center' },
  linkText: { color: '#888', fontSize: 14 },
  linkBold: { color: '#00B386', fontWeight: 'bold', fontSize: 14 },
});
