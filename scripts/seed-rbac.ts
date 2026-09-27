import mysql from "mysql2/promise";
import { config } from "../src/config";
import { v4 as uuidv4 } from "uuid";

// This script expects to be run with ts-node or similar.
async function seedRBAC() {
  console.log("Connecting to database...");
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  });

  try {
    console.log("Starting RBAC seed...");

    // 1. Catalog of Permissions
    const permissions = [
      { id: uuidv4(), name: "orders:read", description: "View orders" },
      { id: uuidv4(), name: "orders:create", description: "Create orders" },
      { id: uuidv4(), name: "orders:update", description: "Update orders" },
      { id: uuidv4(), name: "orders:delete", description: "Delete orders" },
      { id: uuidv4(), name: "invoices:read", description: "View invoices" },
      { id: uuidv4(), name: "invoices:create", description: "Create invoices" },
      { id: uuidv4(), name: "users:read", description: "View child users" },
      { id: uuidv4(), name: "users:create", description: "Create child users" },
    ];

    console.log("Inserting permissions...");
    for (const p of permissions) {
      await conn.query(
        "INSERT IGNORE INTO `permissions` (id, name, description) VALUES (?, ?, ?)",
        [p.id, p.name, p.description]
      );
    }

    // 2. Base Roles (Global, tenant_id is NULL)
    // Here we define the 5 base roles.
    const baseRoles = [
      { id: "11111111-1111-4111-8111-111111111111", name: "admin", is_system: true },
      { id: "22222222-2222-4222-8222-222222222222", name: "staff", is_system: true },
      { id: "33333333-3333-4333-8333-333333333333", name: "driver", is_system: true },
      { id: "44444444-4444-4444-8444-444444444444", name: "client", is_system: true }, // Tenant Admin
      { id: "55555555-5555-4555-8555-555555555555", name: "operator", is_system: true },
    ];

    console.log("Inserting base roles...");
    for (const r of baseRoles) {
      await conn.query(
        "INSERT IGNORE INTO `roles` (id, name, tenant_id, is_system) VALUES (?, ?, NULL, ?)",
        [r.id, r.name, r.is_system]
      );
    }

    // Assign permissions to base roles (Example for 'client')
    const clientRoleId = "44444444-4444-4444-8444-444444444444";
    const clientPermissions = permissions.filter((p) =>
      ["orders:read", "orders:create", "invoices:read", "users:read", "users:create"].includes(p.name)
    );
    for (const p of clientPermissions) {
      await conn.query(
        "INSERT IGNORE INTO `role_permissions` (role_id, permission_id) VALUES (?, ?)",
        [clientRoleId, p.id]
      );
    }

    // 3. Create a Test Tenant (Client Company)
    const tenantId = uuidv4();
    console.log(`Creating test tenant with ID: ${tenantId}`);
    await conn.query(
      "INSERT IGNORE INTO `tenants` (id, name) VALUES (?, ?)",
      [tenantId, "Empresa Cliente S.A."]
    );

    // Create the Tenant Admin user and associate with Tenant
    const tenantAdminId = uuidv4();
    await conn.query(
      `INSERT IGNORE INTO \`users\` (id, name, email, password_hash, role_id, tenant_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantAdminId, "Admin Cliente", "admin@empresacliente.com", "$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m", clientRoleId, tenantId]
    );

    // 4. Simulate the tenant creating a Custom Dynamic Role
    const customRoleId = uuidv4();
    console.log(`Creating custom dynamic role for tenant...`);
    await conn.query(
      "INSERT IGNORE INTO `roles` (id, name, tenant_id, is_system) VALUES (?, ?, ?, ?)",
      [customRoleId, "Auditor de Cliente", tenantId, false]
    );

    // Assign specific permissions to the custom role (e.g., only read invoices and orders)
    const auditorPermissions = permissions.filter((p) =>
      ["orders:read", "invoices:read"].includes(p.name)
    );
    for (const p of auditorPermissions) {
      await conn.query(
        "INSERT IGNORE INTO `role_permissions` (role_id, permission_id) VALUES (?, ?)",
        [customRoleId, p.id]
      );
    }

    // 5. Create a Child User associated with the Tenant and the Custom Dynamic Role
    const childUserId = uuidv4();
    console.log(`Creating child user for tenant with custom role...`);
    await conn.query(
      `INSERT IGNORE INTO \`users\` (id, name, email, password_hash, role_id, tenant_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [childUserId, "Juan Auditor", "juan.auditor@empresacliente.com", "$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m", customRoleId, tenantId]
    );

    console.log("Seed completed successfully!");
  } catch (error) {
    console.error("Error during seed:", error);
  } finally {
    await conn.end();
  }
}

seedRBAC().catch(console.error);
