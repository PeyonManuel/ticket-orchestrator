import { describe, it, expect } from "vitest";
import type { TicketProposal } from "@/domain/orchestrator/types";
import { createGetOtherTicketProposalTool } from "./getOtherTicketProposal";

function mkProposal(over: Partial<TicketProposal> = {}): TicketProposal {
  return {
    id: "prop-aaaa1111",
    hierarchyType: "story",
    title: "Sample ticket",
    oneLiner: "A short summary",
    description: "A longer description.",
    label: "developer",
    storyPoints: null,
    risks: [],
    refined: false,
    transcript: [],
    ...over,
  };
}

describe("createGetOtherTicketProposalTool", () => {
  it("returns the matching ticket fields as JSON", async () => {
    const siblings = [
      mkProposal({ id: "prop-aaaa1111", title: "First", oneLiner: "1L" }),
      mkProposal({
        id: "prop-bbbb2222",
        title: "Auth API",
        oneLiner: "REST endpoints for login/logout",
        description: "Stateless JWT auth. GIVEN valid creds, WHEN POST /login, THEN 200 with token.",
        label: "developer",
        discipline: "developer",
        storyPoints: 5,
        risks: ["Token rotation TBD"],
      }),
    ];
    const tool = createGetOtherTicketProposalTool(siblings, "prop-aaaa1111");

    const raw = await tool.invoke({ ticketId: "prop-bbbb2222" });
    const parsed = JSON.parse(raw as string);

    expect(parsed.title).toBe("Auth API");
    expect(parsed.oneLiner).toBe("REST endpoints for login/logout");
    expect(parsed.description).toBe("Stateless JWT auth. GIVEN valid creds, WHEN POST /login, THEN 200 with token.");
    expect(parsed.label).toBe("developer");
    expect(parsed.discipline).toBe("developer");
    expect(parsed.storyPoints).toBe(5);
    expect(parsed.risks).toEqual(["Token rotation TBD"]);
  });

  it("returns an error payload when the ticketId is the active ticket", async () => {
    const siblings = [mkProposal({ id: "prop-active000" })];
    const tool = createGetOtherTicketProposalTool(siblings, "prop-active000");

    const raw = await tool.invoke({ ticketId: "prop-active000" });
    const parsed = JSON.parse(raw as string);

    expect(parsed.error).toMatch(/active ticket/i);
  });

  it("returns an error payload when the ticketId is unknown", async () => {
    const siblings = [mkProposal({ id: "prop-real0001" })];
    const tool = createGetOtherTicketProposalTool(siblings, "prop-active000");

    const raw = await tool.invoke({ ticketId: "prop-ghost0000" });
    const parsed = JSON.parse(raw as string);

    expect(parsed.error).toMatch(/not found/i);
    expect(parsed.knownIds).toEqual(["prop-real0001"]);
  });

  it("omits the transcript and refined flag (noise)", async () => {
    const siblings = [
      mkProposal({
        id: "prop-clean0000",
        refined: true,
        transcript: [{ id: "t1", role: "user", text: "x", createdAt: "2026-01-01" }],
      }),
    ];
    const tool = createGetOtherTicketProposalTool(siblings, "prop-other");

    const raw = await tool.invoke({ ticketId: "prop-clean0000" });
    const parsed = JSON.parse(raw as string);

    expect(parsed).not.toHaveProperty("transcript");
    expect(parsed).not.toHaveProperty("refined");
  });
});
