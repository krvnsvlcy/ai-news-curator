"use client";

import { type FormEvent, useState } from "react";
import { type AddOutcome, addSubscriber } from "@/lib/subscribers";

const MESSAGES: Record<AddOutcome, string> = {
  added: "You're on the list.",
  reactivated: "Welcome back. You're subscribed again.",
  exists: "You're already subscribed.",
  invalid: "That doesn't look like an email address.",
  "storage-error": "Your browser blocked storage, so we couldn't save your subscription.",
};

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [outcome, setOutcome] = useState<AddOutcome>();
  const ok = outcome === "added" || outcome === "reactivated" || outcome === "exists";

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = addSubscriber(email, { name, source: "signup" });
    setOutcome(result);
  }

  if (ok) {
    return (
      <div className="mt-8 border-l-[3px] border-[#1a1a1a] bg-[#f8f7f3] px-5 py-4" role="status">
        <p className="font-serif text-[20px] font-bold">{MESSAGES[outcome]}</p>
        <p className="mt-1 font-serif text-[16px] text-[#333]">
          The next edition will arrive at <strong>{email.trim().toLowerCase()}</strong>.
        </p>
        <DemoNote />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-3" noValidate>
      <label className="block">
        <span className="text-[13px] font-semibold">Email address</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-invalid={outcome === "invalid"}
          className="mt-1 block w-full border border-[#cfcac0] bg-white px-3 py-2.5 text-[16px] outline-none focus:border-[#1a1a1a] aria-[invalid=true]:border-[#b3261e]"
        />
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold">
          First name <span className="font-normal text-[#77736b]">optional</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          maxLength={100}
          className="mt-1 block w-full border border-[#cfcac0] bg-white px-3 py-2.5 text-[16px] outline-none focus:border-[#1a1a1a]"
        />
      </label>
      {outcome && (
        <p role="alert" className="text-[14px] text-[#b3261e]">
          {MESSAGES[outcome]}
        </p>
      )}
      <button
        type="submit"
        className="w-full bg-[#1a1a1a] px-4 py-3 text-[15px] font-semibold text-white hover:bg-black sm:w-auto"
      >
        Subscribe
      </button>
      <DemoNote />
    </form>
  );
}

function DemoNote() {
  return (
    <p className="pt-2 text-[12.5px] leading-relaxed text-[#77736b]">
      Demo: your subscription is saved only in this browser, not on our servers. It's used when
      someone sends a letter from this same browser.
    </p>
  );
}
