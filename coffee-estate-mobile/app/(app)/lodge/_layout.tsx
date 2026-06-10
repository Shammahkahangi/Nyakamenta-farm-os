import { Redirect, Tabs } from 'expo-router';
import { usePathname } from 'expo-router';
import { canAccessPage, isManagerRole } from '../../../src/auth/estateRole';
import { tabScreenOptions, tabIcon } from '../../../src/navigation/tabTheme';

export default function LodgeLayout() {
  const pathname = usePathname();
  const pageId = pathname.split('/').pop() || '';
  const manager = isManagerRole();

  if (pageId && !canAccessPage(pageId)) {
    return <Redirect href={'/(app)/lodge' as never} />;
  }

  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Lodge', tabBarIcon: tabIcon('holiday-village') }} />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          href: manager ? null : undefined,
          tabBarIcon: tabIcon('bar-chart'),
        }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}
