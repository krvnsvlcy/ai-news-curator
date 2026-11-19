import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  tabs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Shown under the title and description, e.g. a section switcher. */
  tabs?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 shrink-0 bg-surface/75 backdrop-blur-md">
      <div
        className={`flex flex-col gap-3 px-4 pt-6 pb-4 sm:px-8 sm:flex-row sm:items-center sm:justify-between`}
      >
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          {tabs && <div className="mt-3">{tabs}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * Header for one of several equal sections on a page without a PageHeader (the
 * home page): same title style, not sticky. `id` labels the section.
 */
export function SectionHeader({
  id,
  title,
  description,
  actions,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className="truncate text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Page content under the sticky PageHeader; it scrolls beneath it. Full width. */
export function PageBody({ children }: { children: ReactNode }) {
  return <main className="shrink-0 px-4 pt-2 pb-8 sm:px-8">{children}</main>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-rule bg-paper ${className}`}>
      {children}
    </section>
  );
}
