/**
 * Setup users for Coffee Estate OS:
 * - Admin: admin@nyakamentafarm.com (admin)
 * - Farm Manager (Frank): frank@nyakamentafarm.com (admin)
 * - Sacco Worker: sacco@nyakamentafarm.com (sacco_lead)
 *
 * Requires in .env (project root):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const usersToSetup = [
  {
    email: 'admin@nyakamentafarm.com',
    fullName: 'Main Admin',
    role: 'admin',
    password: 'AdminNyakamenta2026!'
  },
  {
    email: 'frank@nyakamentafarm.com',
    fullName: 'Frank Begumanya',
    role: 'admin',
    password: 'FrankNyakamenta2026!'
  },
  {
    email: 'sacco@nyakamentafarm.com',
    fullName: 'Sacco Worker',
    role: 'sacco_lead',
    password: 'SaccoNyakamenta2026!'
  },
  {
    email: 'rena@nyakamentafarm.com',
    fullName: 'Rena',
    role: 'admin',
    password: 'RenaNyakamenta2026!'
  },
  {
    email: 'raymos@nyakamentafarm.com',
    fullName: 'Raymos',
    role: 'admin',
    password: 'RaymosNyakamenta2026!'
  },
  {
    email: 'rolaida@nyakamentafarm.com',
    fullName: 'Rolaida',
    role: 'admin',
    password: 'RolaidaNyakamenta2026!'
  }
];

async function findUserByEmail(adminClient, targetEmail) {
  const needle = targetEmail.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
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

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Connecting to Supabase Auth Admin API...');

  const results = [];

  for (const userConfig of usersToSetup) {
    const { email, fullName, role, password } = userConfig;
    console.log(`\nProcessing user: ${email}...`);

    const existingUser = await findUserByEmail(adminClient, email);

    if (existingUser) {
      console.log(`Found existing user with ID: ${existingUser.id}. Updating password, metadata and role to: ${role}...`);
      const nextAppMeta = { ...(existingUser.app_metadata || {}), estate_role: role };
      const nextUserMeta = { ...(existingUser.user_metadata || {}), full_name: fullName };

      const { data, error } = await adminClient.auth.admin.updateUserById(existingUser.id, {
        password: password,
        user_metadata: nextUserMeta,
        app_metadata: nextAppMeta,
      });

      if (error) {
        console.error(`Failed to update ${email}:`, error.message);
        results.push({ email, fullName, role, password, status: 'Failed: ' + error.message });
      } else {
        console.log(`Successfully updated ${email}`);
        results.push({ email, fullName, role, password, status: 'Updated' });
      }
    } else {
      console.log(`User does not exist. Creating new user...`);
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { estate_role: role },
      });

      if (error) {
        console.error(`Failed to create ${email}:`, error.message);
        results.push({ email, fullName, role, password, status: 'Failed: ' + error.message });
      } else {
        console.log(`Successfully created ${email} (ID: ${data.user?.id})`);
        results.push({ email, fullName, role, password, status: 'Created' });
      }
    }
  }

  console.log('\n======================================================================');
  console.log('User Setup Status and Credentials Summary');
  console.log('======================================================================');
  for (const res of results) {
    console.log(`Email:      ${res.email}`);
    console.log(`Full Name:  ${res.fullName}`);
    console.log(`Role:       ${res.role}`);
    console.log(`Password:   ${res.password}`);
    console.log(`Status:     ${res.status}`);
    console.log('----------------------------------------------------------------------');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
