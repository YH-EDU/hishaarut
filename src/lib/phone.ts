/** Israeli phone numbers for wa.me. Keep in sync with public.normalize_phone_il. */
export function normalizeIlPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("9720")) digits = `972${digits.slice(4)}`;
  if (digits.startsWith("972")) {
    if (digits.length < 11 || digits.length > 13) return null;
    return digits;
  }
  if (digits.startsWith("0") && (digits.length === 9 || digits.length === 10)) {
    return `972${digits.slice(1)}`;
  }
  if (digits.length === 9 && digits.startsWith("5")) return `972${digits}`;
  return null;
}

/** E.164 with a leading plus, for example +972501234567. */
export function toE164(raw: string | null | undefined): string | null {
  const normalized = normalizeIlPhone(raw);
  return normalized ? `+${normalized}` : null;
}

/** Up to two valid mobiles from a cell that may list several, separated by comma, slash, or space. */
export function splitPhoneNumbers(raw: string | null | undefined): string[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];
  const chunks = trimmed
    .split(/[,;|/]+|\s+(?=\d)/)
    .map((part) => part.trim())
    .filter(Boolean);
  const found: string[] = [];
  for (const chunk of chunks.length > 0 ? chunks : [trimmed]) {
    const e164 = toE164(chunk);
    if (e164 && !found.includes(e164)) found.push(e164);
    if (found.length === 2) break;
  }
  return found;
}

/** First number that is valid and not marked "no WhatsApp", then the rest, for a later send fallback. */
export function whatsappCandidates(
  numbers: Array<{ phone: string | null | undefined; noWhatsapp?: boolean }>,
): string[] {
  const found: string[] = [];
  for (const item of numbers) {
    if (item.noWhatsapp) continue;
    const normalized = normalizeIlPhone(item.phone);
    if (normalized && !found.includes(normalized)) found.push(normalized);
  }
  return found;
}

export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizeIlPhone(phone);
  if (!normalized || !message.trim()) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function maskPhone(raw: string | null | undefined): string {
  const normalized = normalizeIlPhone(raw);
  if (!normalized) return "—";
  const local = `0${normalized.slice(3)}`;
  if (local.length < 6) return "••••";
  return `${local.slice(0, 3)}-•••-${local.slice(-3)}`;
}
