"use client";

import { type FormEvent, useMemo, useState } from "react";
import { buttonClass } from "@/components/button-styles";
import { ExternalIcon, TrashIcon } from "@/components/icons";
import { LocalStorageNotice } from "@/components/local-storage-notice";
import { Panel } from "@/components/page";
import { formatDateTime, timeAgo } from "@/lib/format";
import {
  addManySubscribers,
  addSubscriber,
  clearSubscribers,
  removeSubscriber,
  type SubscriberStatus,
  setSubscriberStatus,
  storageAvailable,
  useSubscribers,
} from "@/lib/subscribers";

const input =
  "block w-full rounded-md border border-rule bg-paper px-3 py-1.5 text-[14px] outline-none transition-colors placeholder:text-muted/60 focus:border-ink";

type Filter = "all" | SubscriberStatus;

export function SubscribersManager() {
  const { subscribers, ready } = useSubscribers();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: subscribers.length,
      active: subscribers.filter((s) => s.status === "active").length,
      unsubscribed: subscribers.filter((s) => s.status === "unsubscribed").length,
    }),
    [subscribers],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...subscribers]
      .filter((s) => filter === "all" || s.status === filter)
      .filter((s) => !q || s.email.includes(q) || s.name?.toLowerCase().includes(q))
      .sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));
  }, [subscribers, filter, query]);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const outcome = addSubscriber(email, { name, source: "dashboard" });
    const text = {
      added: `Added ${email.trim()}.`,
      reactivated: `${email.trim()} was unsubscribed and is now active again.`,
      exists: `${email.trim()} is already subscribed.`,
      invalid: "Enter a valid email address.",
      "storage-error": "This browser blocked local storage, so the subscriber couldn't be saved.",
    }[outcome];
    setMessage({ kind: outcome === "added" || outcome === "reactivated" ? "ok" : "error", text });
    if (outcome === "added" || outcome === "reactivated") {
      setEmail("");
      setName("");
    }
  }

  function onBulk(e: FormEvent) {
    e.preventDefault();
    const r = addManySubscribers(bulk);
    const parts = [`Added ${r.added}`];
    if (r.skipped) parts.push(`${r.skipped} already subscribed`);
    if (r.invalid.length)
      parts.push(
        `${r.invalid.length} invalid (${r.invalid.slice(0, 3).join(", ")}${r.invalid.length > 3 ? "…" : ""})`,
      );
    setMessage({
      kind: r.invalid.length && !r.added ? "error" : "ok",
      text: `${parts.join(" · ")}.`,
    });
    if (r.added) {
      setBulk("");
      setBulkOpen(false);
    }
  }

  if (ready && !storageAvailable()) {
    return (
      <p
        role="alert"
        className="rounded-md border border-red-600/20 bg-red-50 px-3 py-2.5 text-[13px] text-red-800"
      >
        This browser isn't allowing local storage (private window or blocked site data), so the demo
        subscriber list can't be kept here. Open the app in a regular window to manage subscribers.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <LocalStorageNotice />

      <Panel>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold">Add subscribers</h2>
            <div className="flex items-center gap-1">
              <a
                href="/subscribe"
                target="_blank"
                rel="noreferrer"
                className={buttonClass("quiet")}
              >
                Public signup page <ExternalIcon className="size-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setBulkOpen((o) => !o)}
                aria-expanded={bulkOpen}
                className={buttonClass("quiet")}
              >
                {bulkOpen ? "Add one" : "Paste a list"}
              </button>
            </div>
          </div>

          {bulkOpen ? (
            <form onSubmit={onBulk} className="mt-3 space-y-2">
              <textarea
                aria-label="Email addresses"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                rows={4}
                placeholder="One per line, or separated by commas"
                className={`${input} resize-y`}
              />
              <button type="submit" className={buttonClass("primary")} disabled={!bulk.trim()}>
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
              <input
                aria-label="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                autoComplete="off"
                maxLength={100}
                className={`${input} sm:w-56`}
              />
              <button
                type="submit"
                className={`${buttonClass("primary")} sm:w-28`}
                disabled={!email.trim()}
              >
                Add
              </button>
            </form>
          )}
          {message && (
            <p
              role={message.kind === "error" ? "alert" : "status"}
              className={`mt-2 text-[12.5px] ${message.kind === "error" ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}
            >
              {message.text}
            </p>
          )}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter subscribers" className="flex flex-wrap gap-1.5">
          {(["all", "active", "unsubscribed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className="rounded-md border border-rule bg-paper px-2.5 py-1 text-[13px] text-muted capitalize transition-colors hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
            >
              {f} <span className="tabular-nums opacity-70">{counts[f]}</span>
            </button>
          ))}
        </nav>
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
              onClick={() =>
                confirm(`Remove all ${subscribers.length} subscribers from this browser?`) &&
                clearSubscribers()
              }
              className={buttonClass("quiet")}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <Panel>
        {!ready ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] font-medium">
              {subscribers.length === 0 ? "No subscribers yet" : "No subscribers match"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {subscribers.length === 0
                ? "Add your own address (or a test inbox) to try sending a letter."
                : "Try another filter or search."}
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
                  <p
                    className={`truncate text-[14px] font-medium ${s.status === "unsubscribed" ? "text-muted line-through decoration-1" : ""}`}
                  >
                    {s.email}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {s.name && <>{s.name} · </>}
                    {s.status === "active" ? "Subscribed" : "Unsubscribed"}{" "}
                    <time
                      dateTime={s.unsubscribedAt ?? s.subscribedAt}
                      title={formatDateTime(new Date(s.unsubscribedAt ?? s.subscribedAt))}
                    >
                      {timeAgo(new Date(s.unsubscribedAt ?? s.subscribedAt))}
                    </time>
                    {s.source === "signup" && " · via signup page"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSubscriberStatus(s.id, s.status === "active" ? "unsubscribed" : "active")
                    }
                    className={`${buttonClass("secondary")} w-28`}
                  >
                    {s.status === "active" ? "Unsubscribe" : "Resubscribe"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSubscriber(s.id)}
                    aria-label={`Remove ${s.email}`}
                    title="Remove"
                    className={`${buttonClass("quiet")} px-2`}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
