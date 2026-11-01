import type { ReactNode } from "react";

export function Sheet({
  title,
  full,
  onClose,
  children,
}: {
  title: string;
  full?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-root">
      <button type="button" className="sheet-backdrop" aria-label="סגירה" onClick={onClose} />
      <section className={full ? "sheet sheet-full" : "sheet"} role="dialog" aria-modal="true" aria-label={title}>
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
