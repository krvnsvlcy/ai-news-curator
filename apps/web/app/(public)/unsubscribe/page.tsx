import { UnsubscribeCard } from "./unsubscribe-card";

export const metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; t?: string }>;
}) {
  const { email, t } = await searchParams;
  return (
    <UnsubscribeCard
      email={typeof email === "string" ? email.slice(0, 254) : ""}
      token={typeof t === "string" ? t.slice(0, 400) : undefined}
    />
  );
}
