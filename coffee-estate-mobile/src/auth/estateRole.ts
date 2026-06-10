export const DOOR_FARM = 'farm';
export const DOOR_SACCO = 'sacco';
export const DOOR_LODGE = 'lodge';

const ALL_DOORS = [DOOR_FARM, DOOR_SACCO, DOOR_LODGE] as const;

export type EstateRole = 'owner' | 'admin' | 'manager' | 'sacco_lead' | 'lodge_lead';

let currentRole: EstateRole = 'owner';

export function initEstateRoleFromUser(user: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null) {
  if (!user) {
    currentRole = 'owner';
    return;
  }
  const raw = String(
    user.app_metadata?.estate_role || user.user_metadata?.estate_role || 'owner'
  ).toLowerCase();
  if (raw === 'manager') currentRole = 'manager';
  else if (raw === 'admin') currentRole = 'admin';
  else if (raw === 'sacco_lead') currentRole = 'sacco_lead';
  else if (raw === 'lodge_lead') currentRole = 'lodge_lead';
  else currentRole = 'owner';
}

export function resetEstateRole() {
  currentRole = 'owner';
}

export function getEstateRole(): EstateRole {
  return currentRole;
}

export function isManagerRole() {
  return getEstateRole() === 'manager';
}

export function isSaccoLead() {
  return getEstateRole() === 'sacco_lead';
}

export function isLodgeLead() {
  return getEstateRole() === 'lodge_lead';
}

export function isOwnerOrAdmin() {
  const r = getEstateRole();
  return r === 'owner' || r === 'admin';
}

export function getAllowedDoors(): string[] {
  const r = getEstateRole();
  if (r === 'owner' || r === 'admin') return [...ALL_DOORS];
  if (r === 'manager') return [DOOR_FARM, DOOR_LODGE];
  if (r === 'sacco_lead') return [DOOR_SACCO];
  if (r === 'lodge_lead') return [DOOR_LODGE];
  return [...ALL_DOORS];
}

export function canOpenDoor(doorId: string) {
  return getAllowedDoors().includes(doorId);
}

export const MANAGER_FORBIDDEN_PAGE_IDS = new Set([
  'owner-overview',
  'sales-finance',
  'sacco',
  'sacco-reports',
  'settings',
  'aiinsights',
  'lodge-reports',
]);

export type NavItem = { id: string; label: string; href: string };

export function getFarmNav(): NavItem[] {
  if (isManagerRole()) {
    return [
      { id: 'manager-overview', label: 'Manager dashboard', href: '/(app)/farm/manager-overview' },
      { id: 'field-ops', label: 'Field Operations', href: '/(app)/farm/field-ops' },
      { id: 'crop-health', label: 'Crop Health', href: '/(app)/farm/crop-health' },
      { id: 'harvest-processing', label: 'Harvest & Processing', href: '/(app)/farm/harvest-processing' },
      { id: 'nursery', label: 'Nursery', href: '/(app)/farm/nursery' },
      { id: 'inventory', label: 'Inventory', href: '/(app)/farm/inventory' },
      { id: 'logbook', label: 'Logbook', href: '/(app)/farm/logbook' },
    ];
  }
  return [
    { id: 'owner-overview', label: 'Overview', href: '/(app)/farm/owner-overview' },
    { id: 'field-ops', label: 'Field Operations', href: '/(app)/farm/field-ops' },
    { id: 'crop-health', label: 'Crop Health', href: '/(app)/farm/crop-health' },
    { id: 'harvest-processing', label: 'Harvest & Processing', href: '/(app)/farm/harvest-processing' },
    { id: 'nursery', label: 'Nursery', href: '/(app)/farm/nursery' },
    { id: 'inventory', label: 'Inventory', href: '/(app)/farm/inventory' },
    { id: 'logbook', label: 'Logbook', href: '/(app)/farm/logbook' },
    { id: 'sales-finance', label: 'Farm Finance', href: '/(app)/farm/sales-finance' },
    { id: 'aiinsights', label: 'AI Insights', href: '/(app)/farm/aiinsights' },
    { id: 'settings', label: 'Settings', href: '/(app)/farm/settings' },
  ];
}

export function getSaccoNav(): NavItem[] {
  return [
    { id: 'sacco', label: 'SACCO', href: '/(app)/sacco/index' },
    { id: 'sacco-reports', label: 'SACCO Reports', href: '/(app)/sacco/reports' },
    { id: 'settings', label: 'Settings', href: '/(app)/sacco/settings' },
  ];
}

export function getLodgeNav(): NavItem[] {
  if (isManagerRole()) {
    return [{ id: 'lodge-dashboard', label: 'Lodge Dashboard', href: '/(app)/lodge/index' }];
  }
  return [
    { id: 'lodge-dashboard', label: 'Lodge Dashboard', href: '/(app)/lodge/index' },
    { id: 'lodge-reports', label: 'Lodge Reports', href: '/(app)/lodge/reports' },
    { id: 'settings', label: 'Settings', href: '/(app)/lodge/settings' },
  ];
}

export function canAccessPage(pageId: string): boolean {
  if (MANAGER_FORBIDDEN_PAGE_IDS.has(pageId) && isManagerRole()) return false;
  return true;
}
