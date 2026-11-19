import { PageBody, PageHeader } from "@/components/page";
import { requireSession } from "@/lib/auth/session";
import { SubscribersManager } from "./subscribers-manager";

export const metadata = { title: "Subscribers · AI News Curator" };

export default async function SubscribersPage() {
  await requireSession();
  return (
    <>
      <PageHeader title="Subscribers" description="Who receives each letter when you send it." />
      <PageBody>
        <SubscribersManager />
      </PageBody>
    </>
  );
}
