export function PageHeader({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      <p>{lede}</p>
    </header>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
