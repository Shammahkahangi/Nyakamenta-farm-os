/**
 * List all Supabase Auth users for Coffee Estate OS.
 *
 * Requires in .env (project root):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/list-users.cjs
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function main() {
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Fetching users from Supabase...');
  let page = 1;
  const perPage = 100;
  const allUsers = [];

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('Failed to list users:', error.message);
      process.exit(1);
    }
    allUsers.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
    if (page > 20) break; // safeguard
  }

  if (allUsers.length === 0) {
    console.log('No users found in Supabase.');
    return;
  }

  console.log(`\nFound ${allUsers.length} users:\n`);
  console.log('--------------------------------------------------------------------------------');
  console.log(
    `${'Email'.padEnd(35)} | ${'Full Name'.padEnd(20)} | ${'Role (estate_role)'.padEnd(15)}`
  );
  console.log('--------------------------------------------------------------------------------');

  for (const u of allUsers) {
    const email = u.email || '(no email)';
    const fullName = u.user_metadata?.full_name || '(no name)';
    const role = u.app_metadata?.estate_role || '(no role)';
    console.log(`${email.padEnd(35)} | ${fullName.padEnd(20)} | ${role.padEnd(15)}`);
  }
  console.log('--------------------------------------------------------------------------------\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
