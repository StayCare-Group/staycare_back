import { UserRegistrationService } from "../src/services/userRegistration.service";
import pool from "../src/db/pool";

async function test() {
  const email1 = `test_no_profile_${Date.now()}@example.com`;
  const email2 = `test_with_profile_${Date.now()}@example.com`;

  try {
    console.log("1. Testing registration WITHOUT client_profile...");
    const user1 = await UserRegistrationService.registerClient({
      name: "No Profile User",
      email: email1,
      password: "password123",
      phone: `12345678_${Date.now()}`,
      language: "es"
    });
    console.log("   Success! User ID:", user1.id);

    console.log("2. Testing registration WITH client_profile (no vat_number)...");
    const user2 = await UserRegistrationService.registerClient({
      name: "With Profile User",
      email: email2,
      password: "password123",
      phone: `87654321_${Date.now()}`,
      language: "es",
      client_profile: {
        contact_person: "John Doe",
        billing_address: "123 Street",
        pricing_tier: "standard"
      }
    });
    console.log("   Success! User ID:", user2.id);

    console.log("Verification COMPLETE.");
    process.exit(0);
  } catch (e) {
    console.error("Verification FAILED:", e);
    process.exit(1);
  }
}

test();
