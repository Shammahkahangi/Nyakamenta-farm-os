import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';

export default function AppLayout() {
  const { loading, signedIn } = useAuth();
  if (loading) return null;
  if (!signedIn) return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
