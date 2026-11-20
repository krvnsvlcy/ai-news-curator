import { PROMPT_KEYS, PROMPTS } from "@curator/ai";
import { listPromptDocs } from "@curator/db";
import { PageBody, PageHeader } from "@/components/page";
import { SettingsTabs } from "@/components/settings-tabs";
import { requireSession } from "@/lib/auth/session";
import { PromptEditor } from "./prompt-editor";

export const metadata = { title: "Prompts · Settings" };

export default async function PromptsPage() {
  await requireSession();
  const docs = new Map((await listPromptDocs()).map((d) => [d._id, d]));
  const customized = PROMPT_KEYS.filter((k) => docs.has(k)).length;

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          customized
            ? `${customized} of ${PROMPT_KEYS.length} AI prompts customized`
            : "AI prompts are using their defaults"
        }
        tabs={<SettingsTabs active="prompts" />}
      />
      <PageBody>
        <p className="mb-5 max-w-3xl text-[13px] text-muted">
          These are the instructions Claude gets for each AI feature. The stories, tone, date and
          the editor's drafts and notes are added around them automatically. Changes apply to the
          next request.
        </p>
        <div className="space-y-4">
          {PROMPT_KEYS.map((key) => {
            const def = PROMPTS[key];
            const doc = docs.get(key);
            return (
              <PromptEditor
                key={key}
                promptKey={key}
                title={def.title}
                description={def.description}
                variables={Object.entries(def.variables)}
                defaultText={def.default}
                initialText={doc?.text ?? def.default}
                initialUpdatedAt={doc?.updatedAt.toISOString()}
                tall={def.default.length > 600}
              />
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
