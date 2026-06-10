import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';

export default function Index() {
  const { loading, signedIn } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d1117' }}>
        <ActivityIndicator color="#c9a227" />
      </View>
    );
  }
  if (signedIn) return <Redirect href="/(app)/hub" />;
  return <Redirect href="/(auth)/login" />;
}
