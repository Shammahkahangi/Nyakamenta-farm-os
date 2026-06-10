// ============================================================
// estateRole.js — Roles and which doors each may open (web session)
// Desktop (Electron): full access (owner).
// ============================================================

/** Door ids — keep in sync with app.js DOORS values */
export const DOOR_FARM = 'farm';
export const DOOR_SACCO = 'sacco';
export const DOOR_LODGE = 'lodge';

const ALL_DOORS = [DOOR_FARM, DOOR_SACCO, DOOR_LODGE];

/** @type {'owner' | 'admin' | 'manager' | 'sacco_lead' | 'lodge_lead'} */
let currentRole = 'owner';

/**
 * Call after Supabase sign-in or when restoring a session (web only).
 * Prefer `app_metadata.estate_role` (set via Admin API); fallback `user_metadata.estate_role`.
 */
export function initEstateRoleFromUser(user) {
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

/** Desktop app: full access. Web: from last initEstateRoleFromUser. */
export function getEstateRole() {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return 'owner';
  }
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

/**
 * Which doors this user may open (Farm / SACCO / Lodge).
 * - owner, admin: all three
 * - manager: farm + lodge (field ops; no SACCO door)
 * - sacco_lead: SACCO only
 * - lodge_lead: lodge only
 */
export function getAllowedDoors() {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return [...ALL_DOORS];
  }
  const r = getEstateRole();
  if (r === 'owner' || r === 'admin') return [...ALL_DOORS];
  if (r === 'manager') return [DOOR_FARM, DOOR_LODGE];
  if (r === 'sacco_lead') return [DOOR_SACCO];
  if (r === 'lodge_lead') return [DOOR_LODGE];
  return [...ALL_DOORS];
}

export function canOpenDoor(doorId) {
  return getAllowedDoors().includes(doorId);
}

/** Pages field managers must not open (farm + lodge). */
export const MANAGER_FORBIDDEN_PAGE_IDS = new Set([
  'owner-overview',
  'sales-finance',
  'sacco',
  'sacco-reports',
  'settings',
  'aiinsights',
  'lodge-reports',
]);
