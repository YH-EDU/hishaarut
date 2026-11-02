import { maskPhone, whatsappUrl } from "../lib/phone";

function Icon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 19l1.2-3.4A8 8 0 1 1 8.4 20L5 19z" />
      <path d="M9 10c.3 1.6 1.6 2.9 3.2 3.2" />
    </svg>
  );
}

export function WhatsAppButton({
  phone,
  message,
  off,
  compact,
}: {
  phone: string;
  message: string;
  off?: boolean;
  compact?: boolean;
}) {
  const url = whatsappUrl(phone, message);
  if (!url) return <bdi className="ltr muted">{phone}</bdi>;
  return (
    <a className={["wa-btn", off ? "is-off" : "", compact ? "is-compact" : ""].filter(Boolean).join(" ")} href={url} target="_blank" rel="noreferrer">
      <Icon />
      <bdi className="ltr">{maskPhone(phone)}</bdi>
    </a>
  );
}
