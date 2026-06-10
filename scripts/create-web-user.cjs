/**
 * Create a Supabase Auth user for Coffee Estate OS (web sign-in).
 *
 * Requires in .env (project root):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (Dashboard → Settings → API → service_role — never ship to clients)
 *
 * Usage:
 *   npm run create-user
 *   npm run create-user -- you@example.com YourPassword123 "Full Name" owner
 *   npm run create-user -- mgr@example.com Pass123 "Field Lead" manager
 *
 * Last argument (optional): owner | admin | manager | sacco_lead | lodge_lead — app_metadata.estate_role
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const DEFAULT_EMAIL = 'owner@nyakamenta-estate.local';
const DEFAULT_PASSWORD = 'EstateOS_Dev2026!';
const DEFAULT_NAME = 'Estate Owner';

async function main() {
  const email = (process.argv[2] || DEFAULT_EMAIL).trim();
  const password = process.argv[3] || DEFAULT_PASSWORD;
  const fullName = process.argv[4] || DEFAULT_NAME;
  let role = (process.argv[5] || 'owner').toLowerCase().trim();
  const validRoles = ['owner', 'admin', 'manager', 'sacco_lead', 'lodge_lead'];
  if (!validRoles.includes(role)) {
    console.error('Invalid role:', role, '— use one of:', validRoles.join(', '));
    process.exit(1);
  }

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    console.error('Add the service role key from: Supabase → Project Settings → API');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { estate_role: role },
  });

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      console.error('User already exists:', email);
      console.error('Pick another email, or delete the user in Supabase → Authentication → Users.');
      process.exit(1);
    }
    console.error('createUser failed:', error.message);
    process.exit(1);
  }

  console.log('Created Auth user:', data.user?.id);
  console.log('');
  console.log('Sign in at http://localhost:3000 (after npm run web) with:');
  console.log('  Email:   ', email);
  console.log('  Password:', password);
  console.log('  Role:   ', role, '(estate_role in app_metadata)');
  console.log('');
  console.log('Change the password after first login if this was a weak default.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
