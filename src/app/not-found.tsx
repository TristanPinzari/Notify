"use client";

import Link from "next/link";
import { BackIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden bg-(--paper)">
      {/* Paper grid backdrop */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            linear-gradient(to right, rgba(60,45,25,.022) 1px, transparent 1px) 0 0 / 44px 44px,
            linear-gradient(to bottom, rgba(60,45,25,.022) 1px, transparent 1px) 0 0 / 44px 44px
          `,
          maskImage:
            "radial-gradient(ellipse 70% 70% at 50% 45%, #000 40%, transparent 100%)",
        }}
      />

      {/* Dashed margin rule */}
      <div
        className="fixed top-0 bottom-0 w-px z-0"
        style={{
          left: "max(34px, 5vw)",
          background:
            "repeating-linear-gradient(to bottom, rgba(180,69,47,.2) 0 7px, transparent 7px 14px)",
        }}
      />

      {/* Brand */}
      <Link
        href="/home"
        className="fixed z-10 font-serif text-[26px] tracking-tight text-(--ink-heading) top-7.5 left-[max(34px,8vw)]"
      >
        <span className="text-(--accent)">N</span>otify
      </Link>

      {/* Content */}
      <div className="relative z-10 max-w-140 w-full text-center">
        <div className="flex items-baseline justify-center mb-8">
          <span className="font-serif text-[148px] leading-[.9] text-(--ink-heading) tracking-tight">
            404
          </span>
        </div>

        <h1 className="font-serif font-normal text-[42px] leading-[1.08] tracking-tight text-(--ink-heading) mb-3.5">
          This page is{" "}
          <em className="italic text-(--accent-text)">
            missing from the notes.
          </em>
        </h1>

        <p className="text-[16.5px] leading-[1.62] text-(--ink-body) mx-auto mb-8 max-w-107.5">
          We compiled everything the class had — but this page just isn&apos;t
          in the collection. The link is no longer valid or broken.
        </p>

        <div className="flex gap-3.25 justify-center flex-wrap">
          <Link
            href="/home"
            className="group inline-flex items-center gap-2.25 whitespace-nowrap text-[15px] font-semibold rounded-[11px] px-5.5 py-3.25 bg-(--accent) text-(--on-accent)! shadow-[0_1px_2px_rgba(60,45,25,.12)] transition-all duration-200 hover:-translate-y-px hover:bg-(--accent-hi) hover:shadow-[0_8px_20px_-6px_rgba(196,121,24,.4)] active:scale-[.98]"
          >
            Back to my classes
            <span className="transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </Link>
          <button
            onClick={() =>
              window.history.length > 1
                ? window.history.back()
                : (window.location.href = "/home")
            }
            className="inline-flex items-center gap-2.25 whitespace-nowrap text-[15px] font-semibold rounded-[11px] px-5.5 py-3.25 bg-(--paper-raised) text-(--ink) border border-(--line-strong) cursor-pointer transition-all duration-200 hover:-translate-y-px hover:bg-(--paper-deep) hover:border-(--ink-fainter) active:scale-[.98]"
          >
            <BackIcon />
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
