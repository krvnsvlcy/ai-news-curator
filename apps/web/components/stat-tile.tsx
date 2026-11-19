import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-rule bg-paper px-4 py-3.5">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 text-[28px] leading-none font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-2 text-[12.5px] text-muted">{detail}</p>}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}
