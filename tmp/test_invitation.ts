import pool from "../src/db/pool";
import { InvitationService } from "../src/services/invitation.service";

async function test() {
  try {
    // Ensure roles exist
    await pool.execute("INSERT IGNORE INTO roles (id, name) VALUES (1, 'admin'), (2, 'staff'), (3, 'driver')");
    
    // Create an existing user
    await pool.execute(
      "INSERT IGNORE INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)",
      ["Existing User", "test@example.com", "hash", 3]
    );

    console.log("Attempting to create invitation for existing user...");
    try {
      await InvitationService.createInvitation("test@example.com", "driver", 1);
      console.log("Verification FAILED: Should have thrown an error");
    } catch (e: any) {
      console.log("Verification SUCCESS: Caught expected error");
      console.log("Message:", e.message);
      console.log("Status Code:", e.statusCode);
      
      if (e.message === "El correo electrónico ya está registrado en el sistema" && e.statusCode === 409) {
        console.log("MATCH: Message and Status code are correct.");
      } else {
        console.log("MISMATCH: Unexpected message or status code.");
      }
    }
    process.exit(0);
  } catch (e) {
    console.error("Test error:", e);
    process.exit(1);
  }
}

test();
