import { describe, expect, it } from "vitest";
import { dispatchNotification } from "../src/lib/notifications";

const base = {
  phone: "050-7000001",
  message: "שלום",
  notificationId: "n1",
  event: "marked" as const,
  recipientType: "parent" as const,
};

describe("dispatchNotification", () => {
  it("returns a wa.me link in manual mode and does not call the cloud sender", async () => {
    let called = false;
    const result = await dispatchNotification({
      ...base,
      mode: "manual_link",
      sendCloud: async () => {
        called = true;
        return { ok: true, message: "" };
      },
    });
    expect(called).toBe(false);
    expect(result.kind).toBe("manual");
    if (result.kind === "manual") expect(result.url.startsWith("https://wa.me/972507000001?text=")).toBe(true);
  });

  it("falls back to the link when the cloud stub is not implemented", async () => {
    const result = await dispatchNotification({
      ...base,
      mode: "cloud_api",
      sendCloud: async (payload) => {
        expect(payload.to).toBe("050-7000001");
        expect(payload.notificationId).toBe("n1");
        return { ok: false, message: "שליחה אוטומטית לא זמינה" };
      },
    });
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.message).toContain("לא זמינה");
      expect(result.fallbackUrl).toContain("https://wa.me/");
    }
  });

  it("reports a real cloud send without a manual link", async () => {
    const result = await dispatchNotification({
      ...base,
      mode: "cloud_api",
      sendCloud: async () => ({ ok: true, message: "" }),
    });
    expect(result).toEqual({ kind: "sent" });
  });
});
