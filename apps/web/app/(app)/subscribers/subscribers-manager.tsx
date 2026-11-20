"use client";

import posthog from "posthog-js";
import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/button-styles";
import { TrashIcon } from "@/components/icons";
import { Panel } from "@/components/page";
import { formatDateTime, timeAgo } from "@/lib/format";
import { count } from "@/lib/metrics";
import { clearLegacySubscribers, readLegacySubscribers, type Subscriber } from "@/lib/subscribers";
import {
  addManySubscribersAction,
  addSubscriberAction,
  clearSubscribersAction,
  importLegacySubscribersAction,
  removeSubscriberAction,
} from "./actions";

const input =
  "block w-full rounded-md border border-rule bg-paper px-3 py-1.5 text-[14px] outline-none transition-colors placeholder:text-muted/60 focus:border-ink";

export function SubscribersManager({
  subscribers,
  total,
}: {
  /** Only the subscribers on this browser's list. */
  subscribers: Subscriber[];
  /** Subscribers across everyone (a count only). */
  total: number;
}) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();
  const [query, setQuery] = useState("");

  // One-time move of the list this browser used to keep in localStorage.
  const imported = useRef(false);
  useEffect(() => {
    if (imported.current) return;
    imported.current = true;
    const legacy = readLegacySubscribers();
    if (legacy.length === 0) return;
    start(async () => {
      const res = await importLegacySubscribersAction(legacy);
      if (!res.ok) return;
      clearLegacySubscribers();
      if (res.moved === 0) return;
      setMessage({
        kind: "ok",
        text: `Moved ${res.moved} ${res.moved === 1 ? "subscriber" : "subscribers"} from this browser's storage to the database.`,
      });
    });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...subscribers]
      .filter((s) => !q || s.email.includes(q))
      .sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));
  }, [subscribers, query]);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const shown = email.trim();
    start(async () => {
      const outcome = await addSubscriberAction(email);
      const text = {
        added: `Added ${shown}.`,
        linked: `${shown} was already subscribed, so it's been added to your list.`,
        exists: `${shown} is already on your list.`,
        invalid: "Enter a valid email address.",
      }[outcome];
      const ok = outcome === "added" || outcome === "linked";
      setMessage({ kind: ok ? "ok" : "error", text });
      if (ok) {
        posthog.capture("subscribers_added", { subscriber_count: 1, method: "single" });
        setEmail("");
      }
    });
  }

  function onBulk(e: FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await addManySubscribersAction(bulk);
      if (r.tooMany) {
        setMessage({ kind: "error", text: "Paste at most 500 addresses at a time." });
        return;
      }
      const parts = [`Added ${r.added}`];
      if (r.skipped) parts.push(`${r.skipped} already on your list`);
      if (r.invalid.length)
        parts.push(
          `${r.invalid.length} invalid (${r.invalid.slice(0, 3).join(", ")}${r.invalid.length > 3 ? "…" : ""})`,
        );
      setMessage({
        kind: r.invalid.length && !r.added ? "error" : "ok",
        text: `${parts.join(" · ")}.`,
      });
      if (r.added) {
        posthog.capture("subscribers_added", { subscriber_count: r.added, method: "bulk" });
        setBulk("");
        setBulkOpen(false);
      }
    });
  }

  function act(
    fn: () => Promise<unknown>,
    event?: "subscriber_removed" | "subscriber_list_cleared",
    properties?: Record<string, number>,
  ) {
    start(async () => {
      await fn();
      if (event) posthog.capture(event, properties);
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted">
        Subscribers are saved on the server, one per address, and only editors add or remove them.
        You see and manage only those on your list (added from this browser); there{" "}
        {total === 1 ? "is" : "are"} {count(total)} across everyone. Letters you send go to everyone
        on your list.
      </p>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold">Add subscribers</h2>
          <button
            type="button"
            onClick={() => setBulkOpen((o) => !o)}
            aria-expanded={bulkOpen}
            className={buttonClass("quiet")}
          >
            {bulkOpen ? "Add one" : "Paste a list"}
          </button>
        </div>

        {bulkOpen ? (
          <form onSubmit={onBulk} className="mt-3 space-y-2">
            <textarea
              aria-label="Email addresses"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder="One per line, or separated by commas"
              className={`${input} h-48 resize-none`}
            />
            <button
              type="submit"
              className={buttonClass("primary")}
              disabled={!bulk.trim() || pending}
            >
              Add addresses
            </button>
          </form>
        ) : (
          <form onSubmit={onAdd} className="mt-3 flex flex-col gap-2 sm:flex-row" noValidate>
            <input
              type="email"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="off"
              className={input}
            />
            <button
              type="submit"
              className={`${buttonClass("primary")} sm:w-28`}
              disabled={!email.trim() || pending}
            >
              Add
            </button>
          </form>
        )}
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`mt-2 text-[12.5px] ${message.kind === "error" ? "text-danger" : "text-blue"}`}
          >
            {message.text}
          </p>
        )}
      </section>

      <hr className="border-rule" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">
          Your list{" "}
          <span className="font-normal text-muted tabular-nums">{count(subscribers.length)}</span>
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="search"
            aria-label="Search subscribers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className={`${input} h-8 w-48 py-0 text-[13px]`}
          />
          {subscribers.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                confirm(
                  `Remove all ${subscribers.length} addresses from your list? Other lists keep theirs.`,
                ) &&
                act(
                  clearSubscribersAction,
                  "subscriber_list_cleared",
                  { subscriber_count: subscribers.length },
                )
              }
              className={buttonClass("quiet")}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <Panel>
        {visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] font-medium">
              {subscribers.length === 0 ? "No subscribers yet" : "No subscribers match"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {subscribers.length === 0
                ? "Add your own address (or a test inbox) to try sending a letter."
                : "Try another search."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rule">
            {visible.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{s.email}</p>
                  <p className="text-[12.5px] text-muted">
                    Added{" "}
                    <time
                      dateTime={s.subscribedAt}
                      title={formatDateTime(new Date(s.subscribedAt))}
                    >
                      {timeAgo(new Date(s.subscribedAt))}
                    </time>
                  </p>
                </div>
                {/* Removing is how you unsubscribe someone: it drops your reference
                    only, and the address is deleted once no list has it. */}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => removeSubscriberAction(s.id), "subscriber_removed")}
                  aria-label={`Remove ${s.email} from your list`}
                  title="Remove from your list. Letters you send won't go to this address."
                  className={`${buttonClass("secondary")} self-start sm:self-auto`}
                >
                  <TrashIcon className="size-4" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
