import { getSource } from "@curator/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, PageHeader, Panel } from "@/components/page";
import { requireSession } from "@/lib/auth/session";
import { deleteSourceAction, saveSource } from "../actions";
import { DeleteSourceButton } from "../delete-button";
import { valuesFromSource } from "../form-values";
import { SourceForm } from "../source-form";

export const metadata = { title: "Edit source · AI News Curator" };

export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const source = await getSource(id);
  if (!source) notFound();

  return (
    <>
      <PageHeader
        title={source.name}
        description={
          <>
            <Link href="/sources" className="hover:text-ink hover:underline">
              Sources
            </Link>{" "}
            / Edit
          </>
        }
      />
      <PageBody narrow>
        <SourceForm
          action={saveSource.bind(null, id)}
          initial={valuesFromSource(source)}
          submitLabel="Save changes"
        />

        <Panel className="mt-6 border-red-600/25">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[14px] font-medium">Delete source</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Removes the source and every story fetched from it.
              </p>
            </div>
            <DeleteSourceButton action={deleteSourceAction.bind(null, id)} name={source.name} />
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
