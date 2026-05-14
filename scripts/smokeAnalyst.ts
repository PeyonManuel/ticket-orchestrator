import fs from "fs";
import path from "path";

// Manually load .env.local (Node doesn't auto-load it outside Next).
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

async function main() {
  const { runAnalystTurn } = await import(
    "../src/infrastructure/orchestrator/realAi/analystGraph"
  );

  console.log("\n— Turn 1 (fresh, exploratory user message) —");
  const out1 = await runAnalystTurn({
    transcript: [],
    userMessage:
      "Build a checkout flow that lets first-time visitors complete a purchase without creating an account.",
  });
  console.log("reply:", out1.reply);
  console.log("summary:", out1.summary);

  console.log("\n— Turn 2 (user says ready) —");
  const out2 = await runAnalystTurn({
    transcript: [
      {
        id: "u1",
        role: "user",
        text: "Build a checkout flow for first-time visitors without account creation.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "a1",
        role: "analyst",
        text: out1.reply,
        createdAt: new Date().toISOString(),
      },
    ],
    userMessage:
      "Primary user is mobile visitors. Out of scope: saved payment methods. No hard deadline. Ready.",
  });
  console.log("reply:", out2.reply);
  console.log("summary:", JSON.stringify(out2.summary, null, 2));
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
