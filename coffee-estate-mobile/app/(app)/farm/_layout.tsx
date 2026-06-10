import { Redirect, Tabs } from 'expo-router';
import { usePathname } from 'expo-router';
import { canAccessPage, isManagerRole } from '../../../src/auth/estateRole';
import { tabScreenOptions, tabIcon } from '../../../src/navigation/tabTheme';

export default function FarmLayout() {
  const pathname = usePathname();
  const pageId = pathname.split('/').pop() || '';
  const manager = isManagerRole();

  if (pageId && !canAccessPage(pageId)) {
    return <Redirect href={manager ? '/(app)/farm/manager-overview' : '/(app)/farm/owner-overview'} />;
  }

  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="manager-overview"
        options={{
          title: 'Home',
          href: manager ? undefined : null,
          tabBarIcon: tabIcon('dashboard'),
        }}
      />
      <Tabs.Screen
        name="owner-overview"
        options={{
          title: 'Home',
          href: manager ? null : undefined,
          tabBarIcon: tabIcon('dashboard'),
        }}
      />
      <Tabs.Screen name="field-ops" options={{ title: 'Field', tabBarIcon: tabIcon('agriculture') }} />
      <Tabs.Screen name="crop-health" options={{ title: 'Health', tabBarIcon: tabIcon('bug-report') }} />
      <Tabs.Screen
        name="harvest-processing"
        options={{ title: 'Harvest', tabBarIcon: tabIcon('local-florist') }}
      />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('apps') }} />
      <Tabs.Screen name="nursery" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="logbook" options={{ href: null }} />
      <Tabs.Screen name="sales-finance" options={{ href: null }} />
      <Tabs.Screen name="aiinsights" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
