import { describe, it, expect } from "vitest";
import {
  acceptanceCriterionSchema,
  composeDescriptionWithAcceptanceCriteria,
  refinementMutationSchema,
  renderAcceptanceCriterion,
  type AcceptanceCriterion,
} from "./types";

describe("acceptanceCriterionSchema (Zod)", () => {
  it("parses a minimal gherkin AC", () => {
    const out = acceptanceCriterionSchema.parse({
      kind: "gherkin",
      given: "the cart is empty",
      when: "the user clicks checkout",
      outcome: "they see an empty-cart message",
    });
    expect(out.kind).toBe("gherkin");
  });

  it("parses a gherkin AC with optional title + and clause", () => {
    const out = acceptanceCriterionSchema.parse({
      kind: "gherkin",
      title: "Empty cart",
      given: "the cart is empty",
      when: "the user clicks checkout",
      and: "no items have been added in this session",
      outcome: "they see an empty-cart message",
    });
    expect(out).toMatchObject({ title: "Empty cart", and: "no items have been added in this session" });
  });

  it("parses a narrative AC", () => {
    const out = acceptanceCriterionSchema.parse({
      kind: "narrative",
      text: "Backend cron job runs once per hour and emits a metric.",
    });
    expect(out.kind).toBe("narrative");
  });

  it("rejects a gherkin AC missing `then`", () => {
    const result = acceptanceCriterionSchema.safeParse({
      kind: "gherkin",
      given: "x",
      when: "y",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a gherkin AC with an empty `given`", () => {
    const result = acceptanceCriterionSchema.safeParse({
      kind: "gherkin",
      given: "",
      when: "y",
      outcome: "z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a narrative AC with an empty text", () => {
    const result = acceptanceCriterionSchema.safeParse({
      kind: "narrative",
      text: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const result = acceptanceCriterionSchema.safeParse({
      kind: "freeform",
      text: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("refinementMutationSchema setAcceptanceCriteria branch", () => {
  it("parses a valid setAcceptanceCriteria mutation", () => {
    const out = refinementMutationSchema.parse({
      kind: "setAcceptanceCriteria",
      acceptanceCriteria: [
        { kind: "gherkin", given: "a", when: "b", outcome: "c" },
        { kind: "narrative", text: "d" },
      ],
    });
    expect(out.kind).toBe("setAcceptanceCriteria");
  });

  it("rejects setAcceptanceCriteria with empty array (schema-level)", () => {
    const result = refinementMutationSchema.safeParse({
      kind: "setAcceptanceCriteria",
      acceptanceCriteria: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("renderAcceptanceCriterion", () => {
  it("renders a basic gherkin AC", () => {
    const ac: AcceptanceCriterion = {
      kind: "gherkin",
      given: "the cart is empty",
      when: "the user clicks checkout",
      outcome: "they see an empty-cart message",
    };
    expect(renderAcceptanceCriterion(ac)).toBe(
      "GIVEN the cart is empty, WHEN the user clicks checkout, THEN they see an empty-cart message",
    );
  });

  it("includes title + AND clause when present", () => {
    const ac: AcceptanceCriterion = {
      kind: "gherkin",
      title: "Happy path",
      given: "X",
      when: "Y",
      and: "Z",
      outcome: "W",
    };
    expect(renderAcceptanceCriterion(ac)).toBe(
      "Scenario: Happy path\nGIVEN X, WHEN Y AND Z, THEN W",
    );
  });

  it("returns narrative text as-is", () => {
    expect(
      renderAcceptanceCriterion({ kind: "narrative", text: "Just text." }),
    ).toBe("Just text.");
  });
});

describe("composeDescriptionWithAcceptanceCriteria", () => {
  it("returns description as-is when AC is empty/absent", () => {
    expect(composeDescriptionWithAcceptanceCriteria("desc", [])).toBe("desc");
    expect(composeDescriptionWithAcceptanceCriteria("desc", undefined)).toBe("desc");
  });

  it("appends AC under a markdown heading when AC is present", () => {
    const out = composeDescriptionWithAcceptanceCriteria("Some prose.", [
      { kind: "gherkin", given: "G", when: "W", outcome: "T" },
      { kind: "narrative", text: "N" },
    ]);
    expect(out).toBe(
      [
        "Some prose.",
        "",
        "## Acceptance Criteria",
        "- GIVEN G, WHEN W, THEN T",
        "- N",
      ].join("\n"),
    );
  });

  it("omits the separator when description is empty", () => {
    const out = composeDescriptionWithAcceptanceCriteria("", [
      { kind: "narrative", text: "Just AC." },
    ]);
    expect(out).toBe("## Acceptance Criteria\n- Just AC.");
  });
});
