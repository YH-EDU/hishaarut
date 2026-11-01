/**
 * Accept the legacy anon JWT and the newer sb_publishable_ key.
 * Reject sb_secret_ so a server key cannot be baked into the site by mistake.
 */
export function isClientSupabaseKey(key: string): boolean {
  const value = key.trim();
  if (!value || value.startsWith("sb_secret_")) return false;
  if (value.startsWith("sb_publishable_")) return value.length > "sb_publishable_".length + 8;
  return value.split(".").length === 3 && value.length > 40;
}

export function pagesRedirectUrl(origin: string, basePath: string): string {
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return new URL(base, origin).toString();
}
