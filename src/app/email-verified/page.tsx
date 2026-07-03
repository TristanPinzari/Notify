"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function EmailVerifiedContent() {
  const { data: session } = authClient.useSession();
  const params = useSearchParams();
  const isEmailChange = params.get("type") === "email-change";
  const name = session?.user?.name;
  const email = session?.user?.email;

  useEffect(() => {
    document.title = isEmailChange
      ? "New email verified — Notify"
      : "Email verified — Notify";
  }, [isEmailChange]);

  if (isEmailChange) {
    return (
      <div className="flex flex-col min-h-screen bg-(--paper) text-(--ink) antialiased">
        <div className="px-8 py-6.5 shrink-0">
          <span className="font-(family-name:--serif) text-[26px] leading-none text-(--ink-heading)">
            <span className="text-(--accent)">N</span>otify
          </span>
        </div>

        <main className="flex-1 flex items-center justify-center px-6 pb-16 pt-5">
          <div className="w-full max-w-115 text-center">
            <div className="w-22 h-22 rounded-full bg-(--success-bg) border border-(--success-soft) flex items-center justify-center mx-auto mb-7.5">
              <svg
                width={44}
                height={44}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--success)"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>

            <div className="font-(family-name:--mono) text-[11px] font-medium tracking-[0.18em] uppercase text-(--success) mb-3.5">
              New email verified
            </div>

            <h1 className="font-(family-name:--serif) font-normal text-[38px] leading-[1.08] tracking-[-0.01em] text-(--ink-heading) mt-0 mb-3.5">
              Your new email is confirmed.
            </h1>

            <p className="text-[15.5px] leading-[1.62] text-(--ink-body) mx-auto mb-7 max-w-90">
              This is now the email for your Notify account. Sign in with it
              from here on.
            </p>

            {email && (
              <span className="inline-block px-4 py-2.5 bg-(--paper-raised) border border-(--line) rounded-xl mx-auto mb-8 text-[14px]">
                <span className="text-(--ink-faint) text-[13px]">Sign in with</span>{" "}
                <strong className="font-medium text-(--ink-heading)">{email}</strong>
              </span>
            )}

            <Link
              href="/home"
              className="inline-flex items-center justify-center gap-2.25 w-full max-w-75 text-[15.5px] font-semibold text-(--on-accent)! bg-(--accent) rounded-xl px-6 py-3.75 no-underline hover:bg-(--accent-text) transition-colors"
            >
              Continue to Notify
              <svg
                width={17}
                height={17}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-(--paper) text-(--ink) antialiased">
      <div className="px-8 py-6.5 shrink-0">
        <span className="font-(family-name:--serif) text-[26px] leading-none text-(--ink-heading)">
          <span className="text-(--accent)">N</span>otify
        </span>
      </div>

      <main className="flex-1 flex items-center justify-center px-6 pb-16 pt-5">
        <div className="w-full max-w-115 text-center">
          <div className="w-22 h-22 rounded-full bg-(--success-bg) border border-(--success-soft) flex items-center justify-center mx-auto mb-7.5">
            <svg
              width={44}
              height={44}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--success)"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
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
                Your email{" "}
                <strong className="text-(--ink-heading)">{email}</strong> is
                confirmed and your account is active. Jump in and start pooling
                notes with your class.
              </>
            ) : (
              "Your email is confirmed and your account is active. Jump in and start pooling notes with your class."
            )}
          </p>

          <Link
            href="/home"
            className="inline-flex items-center justify-center gap-2.25 w-full max-w-75 text-[15.5px] font-semibold text-(--on-accent)! bg-(--accent) rounded-xl px-6 py-3.75 no-underline hover:bg-(--accent-text) transition-colors"
          >
            Get started
            <svg
              width={17}
              height={17}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function EmailVerifiedPage() {
  return (
    <Suspense>
      <EmailVerifiedContent />
    </Suspense>
  );
}
