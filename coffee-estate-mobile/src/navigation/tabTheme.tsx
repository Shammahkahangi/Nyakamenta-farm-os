import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import type { ComponentProps } from 'react';

export const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.goldText,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    backgroundColor: colors.bgSurface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
};

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function tabIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <MaterialIcons name={name} size={size} color={color} />
  );
}
