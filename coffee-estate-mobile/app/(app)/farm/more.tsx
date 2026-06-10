import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { TabShell } from '../../../src/components/TabShell';
import { getFarmNav, isManagerRole } from '../../../src/auth/estateRole';
import { colors } from '../../../src/theme/colors';

const PRIMARY = new Set([
  'owner-overview',
  'manager-overview',
  'field-ops',
  'crop-health',
  'harvest-processing',
  'more',
  'index',
]);

const ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  nursery: 'eco',
  inventory: 'inventory-2',
  logbook: 'menu-book',
  'sales-finance': 'payments',
  aiinsights: 'psychology',
  settings: 'settings',
};

export default function FarmMoreScreen() {
  const router = useRouter();
  const extra = getFarmNav().filter((n) => !PRIMARY.has(n.id));

  return (
    <TabShell title="More" door="farm">
      <Text style={styles.hint}>
        {isManagerRole()
          ? 'Nursery, inventory, logbook, and other modules.'
          : 'Finance, AI, settings, and additional farm modules.'}
      </Text>
      {extra.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.row}
          onPress={() => router.push(item.href as never)}
          activeOpacity={0.7}
        >
          <MaterialIcons name={ICONS[item.id] || 'chevron-right'} size={24} color={colors.goldText} />
          <Text style={styles.label}>{item.label}</Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </TabShell>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  label: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
});
