import type { AppApi } from "./types";

let current: AppApi | null = null;

export function setApi(api: AppApi): void {
  current = api;
}

export function getApi(): AppApi {
  if (!current) throw new Error("המערכת עדיין לא מוכנה");
  return current;
}
