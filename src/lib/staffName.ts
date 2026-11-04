import type { Profile } from "../api/types";

export const TITLE_OPTIONS = ["הרב", "המורה"] as const;

/** Display name has at least a first and a last name. */
export function isFullName(name: string | null | undefined): boolean {
  return (name ?? "").trim().split(/\s+/).filter(Boolean).length >= 2;
}

/** "הרב כהן" when a title is set; otherwise the full name as is. */
export function signatureName(profile: Pick<Profile, "fullName" | "title"> | null | undefined): string {
  const name = (profile?.fullName ?? "").trim().replace(/\s+/g, " ");
  const title = (profile?.title ?? "").trim();
  if (!title) return name;
  const parts = name.split(" ").filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : name;
  return last ? `${title} ${last}` : "";
}

/** "הרב יוסף כהן" for lists. */
export function titledName(profile: Pick<Profile, "fullName" | "title" | "email">): string {
  const name = profile.fullName.trim() || profile.email;
  return profile.title?.trim() ? `${profile.title.trim()} ${name}` : name;
}
