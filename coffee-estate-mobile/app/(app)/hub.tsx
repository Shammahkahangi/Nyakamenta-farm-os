import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getAllowedDoors, getFarmNav } from '../../src/auth/estateRole';
import { colors } from '../../src/theme/colors';

type DoorId = 'farm' | 'sacco' | 'lodge';

type DoorMeta = {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  accent: string;
  href: string;
};

function getDoorMeta(id: DoorId): DoorMeta {
  if (id === 'farm') {
    return {
      label: 'Farm',
      icon: 'agriculture',
      accent: colors.greenText,
      href: getFarmNav()[0]?.href ?? '/(app)/farm/owner-overview',
    };
  }
  if (id === 'sacco') {
    return {
      label: 'SACCO',
      icon: 'account-balance',
      accent: colors.green,
      href: '/(app)/sacco/index',
    };
  }
  return {
    label: 'Lodge',
    icon: 'holiday-village',
    accent: colors.goldText,
    href: '/(app)/lodge/index',
  };
}

export default function HubScreen() {
  const router = useRouter();
  const allowed = getAllowedDoors() as DoorId[];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>Nyakamenta Estate OS</Text>
        <Text style={styles.prompt}>Where do you want to work?</Text>
      </View>

      <View style={styles.doorList}>
        {allowed.map((id) => {
          const meta = getDoorMeta(id);
          return (
            <TouchableOpacity
              key={id}
              style={styles.doorCard}
              activeOpacity={0.75}
              onPress={() => router.push(meta.href as never)}
            >
              <View style={[styles.iconWrap, { borderColor: meta.accent }]}>
                <MaterialIcons name={meta.icon} size={40} color={meta.accent} />
              </View>
              <Text style={styles.doorLabel}>{meta.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 40,
  },
  brand: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  prompt: {
    marginTop: 8,
    fontSize: 15,
    color: colors.textSecondary,
  },
  doorList: {
    flex: 1,
    justifyContent: 'center',
    gap: 28,
  },
  doorCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 32,
    paddingHorizontal: 24,
    minHeight: 140,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  doorLabel: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 0.3,
  },
});
