import { describe, expect, it } from "vitest";
import { maskPhone, normalizeIlPhone, splitPhoneNumbers, whatsappCandidates, whatsappUrl } from "../src/lib/phone";

describe("normalizeIlPhone", () => {
  it("normalizes local mobile numbers", () => {
    expect(normalizeIlPhone("050-7000001")).toBe("972507000001");
    expect(normalizeIlPhone("+972 50-700-0001")).toBe("972507000001");
    expect(normalizeIlPhone("9720507000001")).toBe("972507000001");
  });

  it("normalizes a landline and rejects junk", () => {
    expect(normalizeIlPhone("03-1234567")).toBe("97231234567");
    expect(normalizeIlPhone("abc")).toBeNull();
    expect(normalizeIlPhone("")).toBeNull();
    expect(normalizeIlPhone(null)).toBeNull();
  });
});

describe("whatsappUrl", () => {
  it("builds a wa.me link without putting the phone in the text", () => {
    const url = whatsappUrl("050-7000001", "שלום נועה");
    expect(url).toBe(`https://wa.me/972507000001?text=${encodeURIComponent("שלום נועה")}`);
    expect(url).not.toContain("050");
  });

  it("returns null when the phone cannot be sent", () => {
    expect(whatsappUrl("123", "שלום")).toBeNull();
    expect(whatsappUrl("050-7000001", "  ")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("hides the middle of a mobile number", () => {
    expect(maskPhone("050-7000001")).toBe("050-•••-001");
  });
});

describe("splitPhoneNumbers", () => {
  it("keeps up to two valid numbers and skips the empty side", () => {
    expect(splitPhoneNumbers("050-2612526 ,053-5286346")).toEqual(["+972502612526", "+972535286346"]);
    expect(splitPhoneNumbers("")).toEqual([]);
    expect(whatsappCandidates([
      { phone: "050-2612526", noWhatsapp: true },
      { phone: "053-5286346" },
    ])).toEqual(["972535286346"]);
  });
});
