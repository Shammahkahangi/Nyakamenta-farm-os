import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { Btn, Input, Title, Subtitle } from '../../src/components/ui';
import { colors } from '../../src/theme/colors';

export default function LoginScreen() {
  const { signIn, signInLocal, localWebAuth, initWarning, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/(app)/hub');
    } catch (e) {
      Alert.alert('Sign in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onLocal = async () => {
    setBusy(true);
    try {
      await signInLocal();
      router.replace('/(app)/hub');
    } catch (e) {
      Alert.alert('Local dev', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Title>Nyakamenta Estate OS</Title>
      <Subtitle>Sign in with your estate Supabase account</Subtitle>
      {initWarning ? (
        <Text style={styles.warn}>{initWarning}</Text>
      ) : null}
      <Input value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
      <Input value={password} onChangeText={setPassword} placeholder="Password" />
      <Btn label={busy || authLoading ? 'Please wait…' : 'Sign in'} onPress={onSignIn} disabled={busy || authLoading} />
      {localWebAuth ? (
        <Btn label="Local dev (no Supabase)" onPress={onLocal} variant="ghost" disabled={busy} />
      ) : null}
      <Text style={styles.hint}>API URL: {process.env.EXPO_PUBLIC_ESTATE_API_URL || 'not set'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 80, justifyContent: 'center' },
  warn: {
    marginBottom: 12,
    fontSize: 12,
    color: colors.amber,
    lineHeight: 17,
    backgroundColor: colors.bgSurface,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { marginTop: 16, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
