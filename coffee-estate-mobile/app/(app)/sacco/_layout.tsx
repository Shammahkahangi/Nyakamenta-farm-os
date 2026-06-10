import { Tabs } from 'expo-router';
import { tabScreenOptions, tabIcon } from '../../../src/navigation/tabTheme';

export default function SaccoLayout() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'SACCO', tabBarIcon: tabIcon('account-balance') }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: tabIcon('assessment') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}
