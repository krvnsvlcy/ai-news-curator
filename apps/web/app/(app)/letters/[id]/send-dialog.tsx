"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { buttonClass } from "@/components/button-styles";
import { LocalStorageNotice } from "@/components/local-storage-notice";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { EditorSend, LetterStatus } from "@/lib/letters";
import { isValidEmail, readTestEmail, rememberTestEmail, useSubscribers } from "@/lib/subscribers";
import { type SendResult, sendLetterAction } from "../send-actions";
import { inputClass, labelClass } from "./fields";
import { Modal } from "./modal";

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
  const { subscribers, ready } = useSubscribers();
  const active = subscribers.filter((s) => s.status === "active");
  const [testTo, setTestTo] = useState("");
  const [result, setResult] = useState<{ kind: "test" | "subscribers"; res: SendResult }>();
  const [pending, start] = useTransition();
  const [pendingKind, setPendingKind] = useState<"test" | "subscribers">();

  // biome-ignore lint/correctness/useExhaustiveDependencies: prefill only when the dialog opens
  useEffect(() => {
    if (open) {
      setResult(undefined);
      setTestTo((v) => v || readTestEmail() || active[0]?.email || "");
    }
  }, [open]);

  function send(kind: "test" | "subscribers", recipients: string[]) {
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
      const res = await sendLetterAction({ id: letterId, revision: rev, mode: kind, recipients });
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

  const canSendToSubscribers = status !== "draft" && active.length > 0;
  const subscriberSends = sends.filter((s) => s.kind === "subscribers");

  return (
    <Modal open={open} onClose={onClose} title="Send letter">
      <div className="space-y-5 p-5">
        <LocalStorageNotice />

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
              : active.length === 0
                ? "No active subscribers in this browser yet."
                : `${active.length} active ${active.length === 1 ? "subscriber" : "subscribers"} in this browser.`}{" "}
            <Link href="/subscribers" className="underline hover:text-ink">
              Manage subscribers
            </Link>
          </p>
          {status === "draft" && (
            <p className="text-[12.5px] text-amber-700 dark:text-amber-400">
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
                  `Send this letter to ${active.length} ${active.length === 1 ? "subscriber" : "subscribers"}?`,
                )
              ) {
                send(
                  "subscribers",
                  active.map((s) => s.email),
                );
              }
            }}
            className={buttonClass("primary")}
          >
            {pending && pendingKind === "subscribers"
              ? "Sending…"
              : `Send to ${active.length} ${active.length === 1 ? "subscriber" : "subscribers"}`}
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
      <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">
        {res.error}
      </p>
    );
  }
  return (
    <div role="status" className="text-[12.5px] text-green-700 dark:text-green-400">
      Delivered to {res.delivered} {res.delivered === 1 ? "address" : "addresses"}
      {res.published && ". The letter is now published"}.
      {res.failed.length > 0 && (
        <ul className="mt-1 text-red-600 dark:text-red-400">
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
