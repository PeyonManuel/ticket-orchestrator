import { clerkSetup } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import fs from "fs";
import path from "path";

const AUTH_DIR = path.join(__dirname, ".auth");

export default async function globalSetup() {
  await clerkSetup();

  // Pre-resolve the test user's Clerk org ID so seed helpers can pass it to
  // endpoints that require it in the request body (no user session available there).
  const email = process.env.E2E_CLERK_USER_USERNAME;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!email || !secretKey) return;

  const client = createClerkClient({ secretKey });
  const { data: users } = await client.users.getUserList({ emailAddress: [email] });
  if (users.length === 0) return;

  const { data: memberships } = await client.users.getOrganizationMembershipList({
    userId: users[0].id,
    limit: 10,
  });
  if (memberships.length === 0) return;

  const orgId = memberships[0].organization.id;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(path.join(AUTH_DIR, "context.json"), JSON.stringify({ orgId }));
}
