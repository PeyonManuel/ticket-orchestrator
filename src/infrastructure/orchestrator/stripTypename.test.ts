import { describe, it, expect } from "vitest";
import { stripTypename } from "./stripTypename";

describe("stripTypename", () => {
  it("removes top-level __typename", () => {
    expect(stripTypename({ __typename: "Foo", x: 1 })).toEqual({ x: 1 });
  });

  it("removes nested __typename in objects", () => {
    expect(
      stripTypename({
        __typename: "Outer",
        inner: { __typename: "Inner", y: 2 },
      }),
    ).toEqual({ inner: { y: 2 } });
  });

  it("strips __typename from objects inside arrays", () => {
    expect(
      stripTypename([
        { __typename: "A", x: 1 },
        { __typename: "B", y: 2 },
      ]),
    ).toEqual([{ x: 1 }, { y: 2 }]);
  });

  it("passes through primitives unchanged", () => {
    expect(stripTypename(42)).toBe(42);
    expect(stripTypename("hello")).toBe("hello");
    expect(stripTypename(true)).toBe(true);
    expect(stripTypename(null)).toBe(null);
  });

  it("preserves non-__typename keys", () => {
    const input = { __typename: "X", a: 1, b: "two", c: { __typename: "Y", d: null } };
    expect(stripTypename(input)).toEqual({ a: 1, b: "two", c: { d: null } });
  });

  it("handles deeply nested structures", () => {
    const input = {
      __typename: "Root",
      arr: [
        { __typename: "Item", child: { __typename: "Leaf", v: 1 } },
      ],
    };
    expect(stripTypename(input)).toEqual({
      arr: [{ child: { v: 1 } }],
    });
  });

  it("returns null when given null (does not crash on null prototype check)", () => {
    expect(stripTypename(null)).toBe(null);
  });

  it("returns undefined when given undefined", () => {
    expect(stripTypename(undefined)).toBe(undefined);
  });

  it("returns the same array reference shape (not the same identity, but same content)", () => {
    const input = [1, 2, 3];
    const result = stripTypename(input);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(input);
  });
});
