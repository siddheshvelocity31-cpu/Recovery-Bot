import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Read .env.local or .env
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      content.split("\n").forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1]!.trim();
          let val = (match[2] || "").trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          process.env[key] = val;
        }
      });
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(url, key);

async function createSuperAdmin() {
  const email = "admin@vsar.com";
  const password = "AdminPassword123!";
  const fullName = "Super Administrator";

  console.log(`Connecting to Supabase at ${url}...`);
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("Error listing auth users:", listError);
    return;
  }

  let user = usersData.users.find((u) => u.email === email);

  if (!user) {
    console.log(`Creating auth user ${email}...`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      console.error("Error creating auth user:", createError);
      return;
    }
    user = newUser.user;
    console.log("Auth user created successfully with ID:", user.id);
  } else {
    console.log("Auth user already exists with ID:", user.id);
    await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    console.log("Password updated successfully.");
  }

  // Ensure record in app_user with role 'admin'
  console.log("Syncing with app_user table...");
  const { error: upsertError } = await supabase.from("app_user").upsert({
    id: user.id,
    email,
    full_name: fullName,
    role: "admin",
    is_active: true,
  });

  if (upsertError) {
    console.error("Error upserting app_user:", upsertError);
  } else {
    console.log("\n=======================================================");
    console.log("🎉 SUPERADMIN USER READY!");
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log("Role:     admin");
    console.log("=======================================================\n");
  }
}

createSuperAdmin();
