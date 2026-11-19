import { countSubscribers, listOwnSubscribers } from "@curator/db";
import { PageBody, PageHeader } from "@/components/page";
import { requireSession } from "@/lib/auth/session";
import { count } from "@/lib/metrics";
import { currentOwnerId } from "@/lib/owner-server";
import type { Subscriber } from "@/lib/subscribers";
import { SubscribersManager } from "./subscribers-manager";

export const metadata = { title: "Subscribers · AI News Curator" };

export default async function SubscribersPage() {
  await requireSession();
  const ownerId = await currentOwnerId();
  const [total, own] = await Promise.all([
    countSubscribers(),
    ownerId ? listOwnSubscribers(ownerId) : [],
  ]);
  // Only this browser's own subscribers are sent to the page.
  const subscribers: Subscriber[] = own.map((s) => ({
    id: s._id.toHexString(),
    email: s.email,
    subscribedAt: s.subscribedAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Subscribers"
        description={`${count(total)} in total · ${count(subscribers.length)} on your list`}
      />
      <PageBody>
        <SubscribersManager subscribers={subscribers} total={total} />
      </PageBody>
    </>
  );
}
