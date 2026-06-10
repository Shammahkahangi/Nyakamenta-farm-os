import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <ScrollView style={[styles.screen, style]} contentContainerStyle={styles.screenContent}>{children}</ScrollView>;
}

export function Title({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: string }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Btn({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, variant === 'ghost' && styles.btnGhost, variant === 'danger' && styles.btnDanger, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.btnText, variant === 'ghost' && styles.btnTextGhost]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  multiline?: boolean;
}) {
  return (
    <TextInput
      style={[styles.input, multiline && styles.inputMulti]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType={keyboardType}
      multiline={multiline}
    />
  );
}

export function PillarTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={[styles.tab, active === t.id && styles.tabActive]}
          onPress={() => onChange(t.id)}
        >
          <Text style={[styles.tabText, active === t.id && styles.tabTextActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function Loading() {
  return <ActivityIndicator color={colors.gold} style={{ marginVertical: 24 }} />;
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: 16, paddingBottom: 100 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: colors.gold,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: colors.red },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#0d1117', fontWeight: '600', fontSize: 14 },
  btnTextGhost: { color: colors.text },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    marginBottom: 10,
    fontSize: 15,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  tabBar: { marginBottom: 14, maxHeight: 44 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { borderColor: colors.gold, backgroundColor: '#1c1810' },
  tabText: { color: colors.textSecondary, fontSize: 13 },
  tabTextActive: { color: colors.goldText, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  kpi: { flex: 1, minWidth: '45%', backgroundColor: colors.bgSurface, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  kpiLabel: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: '700', color: colors.text },
});
