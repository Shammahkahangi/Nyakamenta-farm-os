import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname, Slot } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import type { NavItem } from '../auth/estateRole';
import { colors } from '../theme/colors';

export function DoorLayout({
  title,
  nav,
  door,
}: {
  title: string;
  nav: NavItem[];
  door: 'farm' | 'sacco' | 'lodge';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(app)/hub')}>
          <Text style={styles.back}>Doors</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <TouchableOpacity onPress={() => router.push(`/(app)/search?door=${door}`)}>
          <Text style={styles.search}>Search</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.navRow}>
        {nav.map((item) => {
          const active = pathname.includes(item.id) || pathname.endsWith(item.href.split('/').pop() || '');
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.navChip, active && styles.navChipActive]}
              onPress={() => router.push(item.href as never)}
            >
              <Text style={[styles.navChipText, active && styles.navChipTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.content}>
        <Slot />
      </View>
      <TouchableOpacity style={styles.signOut} onPress={() => signOut().then(() => router.replace('/(auth)/login'))}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 48,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.goldText, fontSize: 14 },
  headerTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  search: { color: colors.greenText, fontSize: 14 },
  navRow: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 6 },
  navChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navChipActive: { borderColor: colors.gold },
  navChipText: { color: colors.textSecondary, fontSize: 11 },
  navChipTextActive: { color: colors.goldText, fontWeight: '600' },
  content: { flex: 1 },
  signOut: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  signOutText: { color: colors.redText, fontSize: 13 },
});
