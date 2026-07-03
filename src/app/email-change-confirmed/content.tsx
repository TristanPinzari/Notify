"use client";

import Link from "next/link";
import { XIcon } from "@/components/icons";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-(--paper) text-(--ink) antialiased">
      <div className="px-8 py-6.5 shrink-0">
        <span className="font-(family-name:--serif) text-[26px] leading-none text-(--ink-heading)">
          <span className="text-(--accent)">N</span>otify
        </span>
      </div>
      <main className="flex-1 flex items-center justify-center px-6 pb-16 pt-5">
        <div className="w-full max-w-115 text-center">{children}</div>
      </main>
    </div>
  );
}

function AccentButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2.25 w-full max-w-75 text-[15.5px] font-semibold text-(--on-accent)! bg-(--accent) rounded-xl px-6 py-3.75 no-underline hover:bg-(--accent-text) transition-colors"
    >
      {children}
    </Link>
  );
}

export function EmailChangeConfirmedContent({
  hasError,
  newEmail,
}: {
  hasError: boolean;
  newEmail: string;
}) {
  if (hasError) {
    return (
      <Shell>
        <div className="w-22 h-22 rounded-full bg-(--danger-bg) border border-(--danger-soft) flex items-center justify-center mx-auto mb-7.5 text-(--danger)">
          <XIcon size={40} />
        </div>
        <div className="font-(family-name:--mono) text-[11px] font-medium tracking-[0.18em] uppercase text-(--danger) mb-3.5">
          Link expired
        </div>
        <h1 className="font-(family-name:--serif) font-normal text-[38px] leading-[1.08] tracking-[-0.01em] text-(--ink-heading) mt-0 mb-3.5">
          This link has expired.
        </h1>
        <p className="text-[15.5px] leading-[1.62] text-(--ink-body) mx-auto mb-8 max-w-90">
          Email change confirmation links expire after a short window. Go to
          your account settings to request a new one.
        </p>
        <AccentButton href="/home">Back to Notify</AccentButton>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-22 h-22 rounded-full bg-(--accent-soft) border border-(--line-strong) flex items-center justify-center mx-auto mb-7.5">
        <svg
          width={42}
          height={42}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <path d="m2 7 10 6.5L22 7" />
        </svg>
      </div>
      <div className="font-(family-name:--mono) text-[11px] font-medium tracking-[0.18em] uppercase text-(--accent) mb-3.5">
        Change approved
      </div>
      <h1 className="font-(family-name:--serif) font-normal text-[38px] leading-[1.08] tracking-[-0.01em] text-(--ink-heading) mt-0 mb-3.5">
        One more step — check your new inbox.
      </h1>
      <p className="text-[15.5px] leading-[1.62] text-(--ink-body) mx-auto mb-7 max-w-90">
        You approved this change from your current address. We&apos;ve sent
        a verification link to your new email to finish the process.
      </p>
      {newEmail && (
        <span className="inline-block px-4 py-2.5 bg-(--paper-raised) border border-(--line) rounded-xl mx-auto mb-8 text-[14px]">
          <span className="text-(--ink-faint) text-[13px]">Verification sent to</span>{" "}
          <strong className="font-medium text-(--ink-heading)">{newEmail}</strong>
        </span>
      )}
      <AccentButton href="/home">Back to Notify</AccentButton>
    </Shell>
  );
}
