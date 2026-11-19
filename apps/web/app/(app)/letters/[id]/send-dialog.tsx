"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { buttonClass } from "@/components/button-styles";
import { Modal } from "@/components/modal";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { EditorSend, LetterStatus } from "@/lib/letters";
import { isValidEmail, readTestEmail, rememberTestEmail } from "@/lib/subscribers";
import { type SendResult, sendAudienceAction, sendLetterAction } from "../send-actions";
import { inputClass, labelClass } from "./fields";

export function SendDialog({
  open,
  onClose,
  letterId,
  status,
  revision,
  sends,
  ensureSaved,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  letterId: string;
  status: LetterStatus;
  revision: number;
  sends: EditorSend[];
  /** Saves pending edits; resolves to the current revision, or null if saving failed. */
  ensureSaved: () => Promise<number | null>;
  onSent: (send: EditorSend, published: boolean) => void;
}) {
  // The subscribers on your list (counted on the server when the dialog opens).
  const [audience, setAudience] = useState<{ count: number; limit: number }>();
  const ready = audience !== undefined;
  const listCount = audience?.count ?? 0;
  const [testTo, setTestTo] = useState("");
  const [result, setResult] = useState<{ kind: "test" | "subscribers"; res: SendResult }>();
  const [pending, start] = useTransition();
  const [pendingKind, setPendingKind] = useState<"test" | "subscribers">();

  useEffect(() => {
    if (open) {
      setResult(undefined);
      setTestTo((v) => v || readTestEmail());
      setAudience(undefined);
      sendAudienceAction().then(setAudience, () => setAudience({ count: 0, limit: 0 }));
    }
  }, [open]);

  function send(kind: "test" | "subscribers", recipients: string[] = []) {
    setPendingKind(kind);
    setResult(undefined);
    start(async () => {
      const rev = status === "published" ? revision : await ensureSaved();
      if (rev === null) {
        setResult({
          kind,
          res: { ok: false, error: "Couldn't save your changes, so nothing was sent." },
        });
        return;
      }
      const res = await sendLetterAction(
        kind === "test"
          ? { id: letterId, revision: rev, mode: "test", recipients }
          : { id: letterId, revision: rev, mode: "subscribers" },
      );
      setResult({ kind, res });
      if (res.ok) onSent(res.send, res.published);
    });
  }

  function onTest(e: FormEvent) {
    e.preventDefault();
    const to = testTo.trim().toLowerCase();
    if (!isValidEmail(to)) {
      setResult({
        kind: "test",
        res: { ok: false, error: "Enter a valid email address for the test." },
      });
      return;
    }
    rememberTestEmail(to);
    send("test", [to]);
  }

  const canSendToSubscribers = status !== "draft" && listCount > 0;
  const subscriberSends = sends.filter((s) => s.kind === "subscribers");

  return (
    <Modal open={open} onClose={onClose} title="Send letter">
      <div className="space-y-5 p-5">
        <form onSubmit={onTest} className="space-y-2" noValidate>
          <label htmlFor="test-to" className={labelClass}>
            Send a test
          </label>
          <p className="text-[12.5px] text-muted">
            Sends this version with “[Test]” in the subject. Works for drafts too.
          </p>
          <div className="flex gap-2">
            <input
              id="test-to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={pending}
              className={`${buttonClass("secondary")} shrink-0`}
            >
              {pending && pendingKind === "test" ? "Sending…" : "Send test"}
            </button>
          </div>
          {result?.kind === "test" && <ResultLine res={result.res} />}
        </form>

        <div className="space-y-2 border-t border-rule pt-5">
          <p className={labelClass}>Send to subscribers</p>
          <p className="text-[13px] text-muted">
            {!ready
              ? "Loading subscribers…"
              : listCount === 0
                ? "You haven't added any subscribers yet."
                : `Goes to the ${listCount} ${listCount === 1 ? "subscriber" : "subscribers"} on your list.`}{" "}
            <Link href="/subscribers" className="underline hover:text-ink">
              Manage subscribers
            </Link>
          </p>
          {status === "draft" && (
            <p className="text-[12.5px] text-amber-700">
              Mark the letter ready before sending it to subscribers.
            </p>
          )}
          {status === "ready" && (
            <p className="text-[12.5px] text-muted">
              Sending publishes this letter and locks it for editing.
            </p>
          )}
          {status === "published" && subscriberSends.length > 0 && (
            <p className="text-[12.5px] text-muted">
              Already sent {subscriberSends.length}{" "}
              {subscriberSends.length === 1 ? "time" : "times"}. Sending again delivers the archived
              edition.
            </p>
          )}
          <button
            type="button"
            disabled={!canSendToSubscribers || pending}
            onClick={() => {
              if (
                confirm(
                  `Send this letter to ${listCount} ${listCount === 1 ? "subscriber" : "subscribers"}?`,
                )
              ) {
                send("subscribers");
              }
            }}
            className={buttonClass("primary")}
          >
            {pending && pendingKind === "subscribers"
              ? "Sending…"
              : `Send to ${listCount} ${listCount === 1 ? "subscriber" : "subscribers"}`}
          </button>
          {result?.kind === "subscribers" && <ResultLine res={result.res} />}
        </div>

        {sends.length > 0 && (
          <div className="border-t border-rule pt-4">
            <p className={labelClass}>History</p>
            <ul className="mt-1.5 space-y-1 text-[12.5px] text-muted">
              {[...sends]
                .reverse()
                .slice(0, 8)
                .map((s) => (
                  <li key={s.at} className="flex justify-between gap-3">
                    <span>
                      {s.kind === "test" ? "Test" : "Subscribers"}: {s.delivered} of {s.recipients}{" "}
                      delivered
                      {s.failed > 0 && <span className="text-red-600"> · {s.failed} failed</span>}
                    </span>
                    <time dateTime={s.at} title={formatDateTime(new Date(s.at))}>
                      {timeAgo(new Date(s.at))}
                    </time>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ResultLine({ res }: { res: SendResult }) {
  if (!res.ok) {
    return (
      <p role="alert" className="text-[12.5px] text-red-600">
        {res.error}
      </p>
    );
  }
  return (
    <div role="status" className="text-[12.5px] text-sea">
      Delivered to {res.delivered} {res.delivered === 1 ? "address" : "addresses"}
      {res.published && ". The letter is now published"}.
      {res.failed.length > 0 && (
        <ul className="mt-1 text-red-600">
          {res.failed.map((f) => (
            <li key={f.to}>
              {f.to}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
