// Slice K smoke check — proves that:
//   1. The Orion tool registry accepts registrations and `toolsForPhase` returns
//      them.
//   2. `bindOrionTools(llm, [...])` produces a runnable that the model uses to
//      emit a `tool_call` for our no-op echo tool.
//   3. `bindOrionTools(llm, [])` returns the original llm reference unchanged
//      (so existing actors keep their `withStructuredOutput` capability).
//
// Plain .mjs (not .ts) — tsx's loader mishandles a transitive named import
// inside @langchain/google-genai's response mapper, so we run native Node ESM.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const { tool } = await import("@langchain/core/tools");
const { z } = await import("zod");
const { HumanMessage, SystemMessage } = await import(
  "@langchain/core/messages"
);
const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");

// Inline minimal copies of the registry + bindOrionTools so this script doesn't
// depend on a TS toolchain. The shapes mirror what's in
// src/infrastructure/orchestrator/tools/registry.ts and src/.../llm.ts — if
// those drift, update here.
const REGISTRY = {
  phase1: [],
  phase2: [],
  phase3: [],
  phase4: [],
  phase5: [],
};
const toolsForPhase = (phase) => REGISTRY[phase];
const registerTool = (phase, t) => {
  if (!REGISTRY[phase].some((x) => x.name === t.name)) REGISTRY[phase].push(t);
};
const bindOrionTools = (llm, tools) =>
  tools.length === 0 ? llm : llm.bindTools(tools);

let echoCalls = 0;
const echoTool = tool(
  async ({ phrase }) => {
    echoCalls += 1;
    return `ECHO_RESULT[${phrase}]`;
  },
  {
    name: "echo",
    description:
      "Returns the input phrase wrapped in ECHO_RESULT[...]. Use this whenever the user asks you to echo something.",
    schema: z.object({ phrase: z.string() }),
  },
);

console.log("\n— Registry check (empty by default) —");
console.log(
  "phase3 tools:",
  toolsForPhase("phase3").map((t) => t.name),
);

console.log("\n— Register echoTool for phase3 —");
registerTool("phase3", echoTool);
console.log(
  "phase3 tools after register:",
  toolsForPhase("phase3").map((t) => t.name),
);

console.log("\n— Bind tools to LLM and invoke —");
const llm = new ChatGoogleGenerativeAI({
  model: process.env.ORCHESTRATOR_MODEL ?? "gemini-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY,
  temperature: 0,
});
const bound = bindOrionTools(llm, toolsForPhase("phase3"));
const response = await bound.invoke([
  new SystemMessage(
    "You have one tool: 'echo'. When the user asks for an echo, call the tool. Never produce ECHO_RESULT yourself; always go through the tool.",
  ),
  new HumanMessage("Please echo the phrase 'orion-tools-online'."),
]);

const toolCalls = response.tool_calls ?? [];
console.log("tool_calls:", JSON.stringify(toolCalls, null, 2));

if (toolCalls.length === 0) {
  console.error("FAIL: model did not produce a tool_call");
  process.exit(1);
}

console.log("\n— bindOrionTools with empty list returns bare llm —");
const noop = bindOrionTools(llm, []);
if (noop !== llm) {
  console.error("FAIL: bindOrionTools([]) should return the original llm");
  process.exit(1);
}
console.log("ok: empty bind returns the bare model");

console.log("\nALL CHECKS PASSED");
console.log(`(echo tool defined ${echoCalls === 0 ? "but never directly invoked — model only emitted a tool_call request, which is the correct behavior" : `and invoked ${echoCalls} time(s)`})`);

// Avoid "unused var" lint when this runs from CI.
void pathToFileURL;
