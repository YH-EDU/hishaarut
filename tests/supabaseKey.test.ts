import { describe, expect, it } from "vitest";
import { isClientSupabaseKey, pagesRedirectUrl } from "../src/lib/supabaseKey";

const PUBLISHABLE = "sb_publishable_IOAO8TrMetGb8DUKjjxb6Q_vAWL-dKP";

describe("isClientSupabaseKey", () => {
  it("accepts the publishable key and a legacy anon JWT", () => {
    expect(isClientSupabaseKey(PUBLISHABLE)).toBe(true);
    expect(isClientSupabaseKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln")).toBe(true);
  });

  it("rejects a secret key and empty input", () => {
    expect(isClientSupabaseKey("sb_secret_IOAO8TrMetGb8DUKjjxb6Q_vAWL-dKP")).toBe(false);
    expect(isClientSupabaseKey("")).toBe(false);
    expect(isClientSupabaseKey("short")).toBe(false);
  });
});

describe("pagesRedirectUrl", () => {
  it("returns the GitHub Pages origin with the repo base path", () => {
    expect(pagesRedirectUrl("https://yh-edu.github.io", "/hishaarut/")).toBe(
      "https://yh-edu.github.io/hishaarut/",
    );
  });
});
