import { describe, expect, it } from "vitest";
import { blockedDeleteMessage } from "../src/lib/archive";

describe("blocked delete message", () => {
  it("names the student and points to the archive", () => {
    expect(blockedDeleteMessage("נועה ברק")).toBe(
      "אי אפשר למחוק את נועה ברק כי יש השארות רשומות. אפשר להעביר לארכיון במקום.",
    );
  });

  it("names the class", () => {
    expect(blockedDeleteMessage("כיתה ז׳1")).toContain("כיתה ז׳1");
  });
});
