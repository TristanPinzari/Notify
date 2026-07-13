"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { applyConsent, useConsent } from "@/lib/consent";
import { CookieIcon } from "@/components/icons";

export function CookieBanner() {
  const consent = useConsent();
  const { data: session } = authClient.useSession();

  if (!session || consent !== null) return null;

  return (
    <>
      <div className="modal-backdrop" />
      <div className="modal max-w-120!">
        <div className="flex flex-col items-center text-center mb-5">
          <span className="flex items-center justify-center rounded-xl mb-4 shrink-0 w-12 h-12 bg-(--accent-soft) text-(--accent-text)">
            <CookieIcon />
          </span>
          <div className="font-mono uppercase tracking-[0.12em] mb-2 text-[10px] text-(--ink-fainter)">
            A quick note on cookies
          </div>
          <h2 className="font-serif text-[22px] font-normal text-(--ink-heading) m-0 leading-[1.2]">
            We use analytics cookies
          </h2>
        </div>

        <p className="text-[13px] text-(--ink-body) mt-0 mb-1.5 leading-[1.6] text-center">
          Notify uses <strong>PostHog</strong> for anonymous analytics — page
          views and feature usage — to understand how the app is used and make
          it better. No study data is ever collected or shared.{" "}
          <Link href="/privacy" className="lk-accent">
            Privacy Policy
          </Link>
        </p>

        <div className="flex flex-col gap-2 mt-5">
          <button
            className="btn btn-primary w-full justify-center"
            onClick={() => applyConsent("accepted")}
          >
            Accept
          </button>
          <button
            className="btn btn-ghost w-full justify-center"
            onClick={() => applyConsent("declined")}
          >
            Reject
          </button>
        </div>

        <p className="text-[11.5px] text-(--ink-fainter) mt-3.5 text-center leading-normal">
          You can change this anytime in your preferences.
        </p>
      </div>
    </>
  );
}
