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
