import type { ReactNode } from "react";

export function Sheet({
  title,
  full,
  confirm,
  onClose,
  children,
}: {
  title: string;
  full?: boolean;
  confirm?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const kind = full ? "sheet sheet-full" : confirm ? "sheet confirm-sheet" : "sheet";
  return (
    <div className="sheet-root">
      <button type="button" className="sheet-backdrop" aria-label="סגירה" onClick={onClose} />
      <section className={kind} role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-bar">
          <h2>{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            סגירה
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
