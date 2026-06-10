/**
 * Set app_metadata.estate_role for an existing Supabase user (by email).
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage:
 *   npm run set-role -- manager@nyakamentafarm.com manager
 *   npm run set-role -- owner@example.com owner
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const email = (process.argv[2] || '').trim().toLowerCase();
const role = (process.argv[3] || '').trim().toLowerCase();

async function findUserByEmail(admin, targetEmail) {
  const needle = targetEmail.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === needle);
    if (u) return u;
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

async function main() {
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  if (!email || !role) {
    console.error('Usage: npm run set-role -- <email> <role>');
    process.exit(1);
  }
  const validRoles = ['owner', 'admin', 'manager', 'sacco_lead', 'lodge_lead'];
  if (!validRoles.includes(role)) {
    console.error('Role must be one of:', validRoles.join(', '));
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await findUserByEmail(admin, email);
  if (!user) {
    console.error('No user found with email:', email);
    console.error('Create the user first (Supabase dashboard or npm run create-user).');
    process.exit(1);
  }

  const nextMeta = { ...(user.app_metadata || {}), estate_role: role };
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: nextMeta,
  });
  if (error) {
    console.error('updateUserById failed:', error.message);
    process.exit(1);
  }

  console.log('Updated', data.user.email, '→ estate_role:', role);
  console.log('Ask them to sign out and sign in again (or refresh) so the app picks up the new role.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
