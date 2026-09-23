import { describe, expect, test } from "bun:test";
import { formatAdd, groupSetupArgs } from "./pueue.ts";

describe("groupSetupArgs", () => {
  test("creates a group that does not exist yet", () => {
    expect(groupSetupArgs(["default"], "gup", 1)).toEqual([
      "group",
      "add",
      "gup",
      "--parallel",
      "1",
    ]);
  });

  test("resets the slots of a group that already exists", () => {
    expect(groupSetupArgs(["default", "gup"], "gup", 1)).toEqual([
      "parallel",
      "1",
      "--group",
      "gup",
    ]);
  });
});

describe("formatAdd", () => {
  test("leaves the group out when none is given", () => {
    expect(formatAdd("gup export")).toBe("pueue add -- gup export");
  });

  test("puts the group ahead of the dependencies", () => {
    expect(formatAdd("gup export", { group: "gup", after: ["#1", "#2"] })).toBe(
      "pueue add --group gup --after #1 #2 -- gup export",
    );
  });
});
