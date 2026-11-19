"use client";

import { useState } from "react";
import { addSubscriber, normalizeEmail, unsubscribeEmail, useSubscribers } from "@/lib/subscribers";
import { recordUnsubscribeAction } from "./actions";

export function UnsubscribeCard({ email: rawEmail, token }: { email: string; token?: string }) {
  const { subscribers, ready } = useSubscribers();
  const email = normalizeEmail(rawEmail);
  const [done, setDone] = useState<"unsubscribed" | "resubscribed" | "storage-error">();
  const sub = subscribers.find((s) => s.email === email);

  let body: React.ReactNode;
  if (!email) {
    body = <p>This link is missing an email address.</p>;
  } else if (!ready) {
    body = <p className="text-[#77736b]">One moment…</p>;
  } else if (done === "storage-error") {
    body = <p>Your browser blocked storage, so we couldn't update your subscription.</p>;
  } else if (!sub) {
    body = (
      <p>
        <strong>{email}</strong> isn't on the subscriber list in this browser. In this demo,
        subscriptions are stored in the browser that added them, so open this link there.
      </p>
    );
  } else if (sub.status === "unsubscribed") {
    body = (
      <>
        <p>
          <strong>{email}</strong> {done === "unsubscribed" ? "has been" : "is"} unsubscribed. You
          won't receive further letters.
        </p>
        <button
          type="button"
          onClick={() => {
            addSubscriber(email, { source: "signup" });
            setDone("resubscribed");
          }}
          className="mt-5 border border-[#1a1a1a] px-4 py-2 text-[14px] font-semibold hover:bg-[#f3f2ee]"
        >
          Changed your mind? Resubscribe
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p>
          {done === "resubscribed" ? "You're subscribed again. " : ""}Stop sending letters to{" "}
          <strong>{email}</strong>?
        </p>
        <button
          type="button"
          onClick={() => {
            const r = unsubscribeEmail(email);
            setDone(r === "storage-error" ? "storage-error" : "unsubscribed");
            // Count it for the letter's analytics (anonymous; fire-and-forget).
            if (r === "unsubscribed" && token) void recordUnsubscribeAction(token);
          }}
          className="mt-5 bg-[#1a1a1a] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-black"
        >
          Unsubscribe
        </button>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-8 font-serif text-[30px] leading-tight font-bold tracking-tight">
        Unsubscribe
      </h1>
      <div className="mt-4 font-serif text-[18px] leading-relaxed text-[#333]" role="status">
        {body}
      </div>
      <p className="mt-8 text-[12.5px] text-[#77736b]">
        Demo: subscriptions are kept in this browser only.{" "}
        <a href="/subscribe" className="underline">
          Subscription page
        </a>
      </p>
    </>
  );
}
