import Link from "next/link";
import { PageBody, PageHeader } from "@/components/page";
import { requireSession } from "@/lib/auth/session";
import { saveSource } from "../actions";
import { EMPTY_SOURCE } from "../form-values";
import { SourceForm } from "../source-form";

export const metadata = { title: "New source · AI News Curator" };

export default async function NewSourcePage() {
  await requireSession();
  return (
    <>
      <PageHeader
        title="New source"
        description={
          <>
            <Link href="/settings" className="hover:text-ink hover:underline">
              Settings
            </Link>{" "}
            /{" "}
            <Link href="/settings/sources" className="hover:text-ink hover:underline">
              Sources
            </Link>{" "}
            / New
          </>
        }
      />
      <PageBody>
        <SourceForm
          action={saveSource.bind(null, null)}
          initial={EMPTY_SOURCE}
          submitLabel="Create source"
        />
      </PageBody>
    </>
  );
}
