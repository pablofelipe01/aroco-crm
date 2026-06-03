/**
 * Bootstrap the first admin user (invite-only platforms need a seed admin).
 * Idempotent: if the email already exists it just ensures the profile is
 * admin + Dirección + active.
 *
 *   pnpm tsx scripts/bootstrap-admin.ts <email> [password] [full_name]
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3];
const fullName = process.argv[4] ?? "Administrador AROCO";

if (!email || !password) {
  console.error(
    "Usage: pnpm tsx scripts/bootstrap-admin.ts <email> <password> [full_name]",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target: string) {
  // Paginate through users to find a match (no direct get-by-email API).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  let user = await findUserByEmail(email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, department: "Dirección", role: "admin" },
    });
    if (error) throw error;
    user = data.user;
    console.log(`✓ Created auth user ${email} (password: ${password})`);
  } else {
    console.log(`• Auth user ${email} already exists — ensuring admin profile.`);
  }

  // Ensure the profile row exists and is admin/Dirección/active.
  const { error: upErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      department: "Dirección",
      role: "admin",
      active: true,
    },
    { onConflict: "id" },
  );
  if (upErr) throw upErr;

  console.log(`✓ Profile ready: ${fullName} · Dirección · admin · active`);
  console.log(`\nLog in at /login with:\n  email:    ${email}\n  password: ${password}`);
}

main().catch((e) => {
  console.error("Bootstrap failed:", e.message ?? e);
  process.exit(1);
});
