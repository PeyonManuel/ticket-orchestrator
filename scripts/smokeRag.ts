import fs from "fs";
import path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

const SMOKE_ORG = "org_smoke_rag_l";
const DB = "orion";
const COLL = "epicEmbeddings";

async function main() {
  const { MongoClient } = await import("mongodb");
  const { createOrchestratorEmbeddings } = await import(
    "../src/infrastructure/orchestrator/rag/embeddings"
  );
  const { searchSimilarEpics } = await import(
    "../src/infrastructure/orchestrator/rag/store"
  );

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI not set in .env.local — smoke needs Mongo");
  }

  const mongo = new MongoClient(process.env.MONGODB_URI);
  await mongo.connect();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const col = mongo.db(DB).collection<any>(COLL);

  console.log("\n— Seed two fake epic embeddings —");
  const embeddings = createOrchestratorEmbeddings();
  const fixtures = [
    {
      id: "emb_smoke_checkout",
      title: "Guest checkout for mobile",
      text:
        "Epic: Guest checkout for mobile\n\nEnable first-time mobile visitors to buy without account creation.\n\nTickets:\n- [developer] Mobile cart UI\n- [developer] Guest payment flow\n- [qa] Mobile end-to-end tests",
    },
    {
      id: "emb_smoke_dashboard",
      title: "Admin reporting dashboard",
      text:
        "Epic: Admin reporting dashboard\n\nGive admins a unified view of revenue, churn, and active users.\n\nTickets:\n- [developer] Aggregation queries\n- [ux] Dashboard layout + charts\n- [po] Metric definitions doc",
    },
  ];

  for (const f of fixtures) {
    const vec = await embeddings.embedQuery(f.text);
    await col.replaceOne(
      { _id: f.id, orgId: SMOKE_ORG },
      {
        _id: f.id,
        orgId: SMOKE_ORG,
        boardId: "board_smoke",
        epicSnapshotId: f.id,
        epicTicketId: `ticket_${f.id}`,
        title: f.title,
        text: f.text,
        embedding: vec,
        createdAt: new Date().toISOString(),
      },
      { upsert: true },
    );
    console.log(`  wrote ${f.id} (${vec.length}d)`);
  }

  console.log("\n— Query 1: 'mobile checkout for guests' —");
  const r1 = await searchSimilarEpics(
    SMOKE_ORG,
    "mobile checkout for guests",
    5,
  );
  for (const h of r1) {
    console.log(`  ${h.similarity.toFixed(3)}  ${h.title}`);
  }
  if (r1[0]?.title !== "Guest checkout for mobile") {
    throw new Error(
      `Expected 'Guest checkout for mobile' first, got '${r1[0]?.title}'`,
    );
  }

  console.log("\n— Query 2: 'analytics dashboard for managers' —");
  const r2 = await searchSimilarEpics(
    SMOKE_ORG,
    "analytics dashboard for managers",
    5,
  );
  for (const h of r2) {
    console.log(`  ${h.similarity.toFixed(3)}  ${h.title}`);
  }
  if (r2[0]?.title !== "Admin reporting dashboard") {
    throw new Error(
      `Expected 'Admin reporting dashboard' first, got '${r2[0]?.title}'`,
    );
  }

  console.log("\n— Cleanup smoke docs —");
  const del = await col.deleteMany({ orgId: SMOKE_ORG });
  console.log(`  deleted ${del.deletedCount}`);

  await mongo.close();
  console.log("\nALL CHECKS PASSED");
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
