"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { XIcon, CheckIcon, ArrowRightIcon } from "@/components/icons";

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

function AccentButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2.25 w-full max-w-75 text-[15.5px] font-semibold text-(--on-accent)! bg-(--accent) rounded-xl px-6 py-3.75 no-underline hover:bg-(--accent-text) transition-colors"
    >
      {children}
    </Link>
  );
}

export function EmailVerifiedContent({
  hasError,
  isEmailChange,
}: {
  hasError: boolean;
  isEmailChange: boolean;
}) {
  const { data: session } = authClient.useSession();
  const name = session?.user?.name;
  const email = session?.user?.email;

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
          {isEmailChange
            ? "Email verification links expire after 24 hours. Go to your account settings to request a new email change."
            : "Verification links expire after 24 hours. Sign in and request a new one from your account."}
        </p>
        <AccentButton href={isEmailChange ? "/home" : "/sign-in"}>
          {isEmailChange ? "Back to Notify" : "Back to sign in"}
          <ArrowRightIcon />
        </AccentButton>
      </Shell>
    );
  }

  if (isEmailChange) {
    return (
      <Shell>
        <div className="w-22 h-22 rounded-full bg-(--success-bg) border border-(--success-soft) flex items-center justify-center mx-auto mb-7.5 text-(--success)">
          <CheckIcon size={44} />
        </div>
        <div className="font-(family-name:--mono) text-[11px] font-medium tracking-[0.18em] uppercase text-(--success) mb-3.5">
          New email verified
        </div>
        <h1 className="font-(family-name:--serif) font-normal text-[38px] leading-[1.08] tracking-[-0.01em] text-(--ink-heading) mt-0 mb-3.5">
          Your new email is confirmed.
        </h1>
        <p className="text-[15.5px] leading-[1.62] text-(--ink-body) mx-auto mb-7 max-w-90">
          This is now the email for your Notify account. Sign in with it from
          here on.
        </p>
        {email && (
          <span className="inline-block px-4 py-2.5 bg-(--paper-raised) border border-(--line) rounded-xl mx-auto mb-8 text-[14px]">
            <span className="text-(--ink-faint) text-[13px]">Sign in with</span>{" "}
            <strong className="font-medium text-(--ink-heading)">
              {email}
            </strong>
          </span>
        )}
        <AccentButton href="/home">
          Continue to Notify
          <ArrowRightIcon />
        </AccentButton>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-22 h-22 rounded-full bg-(--success-bg) border border-(--success-soft) flex items-center justify-center mx-auto mb-7.5 text-(--success)">
        <CheckIcon size={44} />
      </div>
      <div className="font-(family-name:--mono) text-[11px] font-medium tracking-[0.18em] uppercase text-(--success) mb-3.5">
        Email verified
      </div>
      <h1 className="font-(family-name:--serif) font-normal text-[38px] leading-[1.08] tracking-[-0.01em] text-(--ink-heading) mt-0 mb-3.5">
        {name ? `You're all set, ${name}.` : "You're all set."}
      </h1>
      <p className="text-[15.5px] leading-[1.62] text-(--ink-body) mx-auto mb-8 max-w-90">
        {email ? (
          <>
            Your email <strong className="text-(--ink-heading)">{email}</strong>{" "}
            is confirmed and your account is active. Jump in and start pooling
            notes with your class.
          </>
        ) : (
          "Your email is confirmed and your account is active. Jump in and start pooling notes with your class."
        )}
      </p>
      <AccentButton href="/home">
        Get started
        <ArrowRightIcon />
      </AccentButton>
    </Shell>
  );
}
