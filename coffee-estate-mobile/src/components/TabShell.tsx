import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type TabShellProps = {
  title: string;
  door: 'farm' | 'sacco' | 'lodge';
  children: React.ReactNode;
};

export function TabShell({ title, door, children }: TabShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(app)/hub')} hitSlop={12}>
          <Text style={styles.hubLink}>Doors</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <TouchableOpacity onPress={() => router.push(`/(app)/search?door=${door}` as never)} hitSlop={12}>
          <Text style={styles.searchLink}>Search</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  hubLink: { color: colors.goldText, fontSize: 14, fontWeight: '600', width: 56 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  searchLink: { color: colors.greenText, fontSize: 14, fontWeight: '600', width: 56, textAlign: 'right' },
  body: { flex: 1 },
});
