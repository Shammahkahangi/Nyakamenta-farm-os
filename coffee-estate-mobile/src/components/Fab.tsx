import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

export function Fab({
  onPress,
  label,
  bottomOffset = 0,
}: {
  onPress: () => void;
  label?: string;
  /** Extra px above tab bar (stack multiple FABs) */
  bottomOffset?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.fab, label ? styles.fabWithLabel : null, { bottom: 72 + insets.bottom + bottomOffset }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <MaterialIcons name="add" size={28} color="#0d1117" />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    gap: 6,
  },
  fabWithLabel: { paddingHorizontal: 18 },
  label: { color: '#0d1117', fontWeight: '700', fontSize: 14 },
});
