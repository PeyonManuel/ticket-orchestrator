import fs from "fs";
import path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function main() {
  const { runArchitectBacklog } = await import(
    "../src/infrastructure/orchestrator/realAi/architectGraph"
  );
  const { runControllerRefinement } = await import(
    "../src/infrastructure/orchestrator/realAi/controllerGraph"
  );

  console.log("\n— Architect (generate backlog from summary) —");
  const backlog = await runArchitectBacklog({
    summary: {
      summary:
        "An Epic to deliver a streamlined checkout for first-time mobile visitors, without account creation. Focus on the core purchase path on mobile devices.",
      goals: [
        "Enable first-time mobile visitors to complete a purchase",
        "Skip account creation in the v1 flow",
        "Optimize for mobile devices",
        "Process payments securely for guest users",
      ],
    },
  });
  console.log("epicTitle:", backlog.epicTitle);
  console.log("epicDescription:", backlog.epicDescription);
  console.log(`tickets (${backlog.tickets.length}):`);
  for (const t of backlog.tickets) {
    console.log(`  - [${t.label}, ${t.hierarchyType}] ${t.title}`);
    console.log(`    ${t.oneLiner}`);
  }

  console.log("\n— Controller (refine first ticket) —");
  const refined = await runControllerRefinement({
    ticket: backlog.tickets[0],
    backlog,
  });
  console.log("description:", refined.description);
  console.log("storyPoints:", refined.storyPoints);
  console.log("risks:", refined.risks);
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
