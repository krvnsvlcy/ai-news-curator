"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { type ButtonVariant, buttonClass } from "./button-styles";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass(variant)} ${className}`}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
