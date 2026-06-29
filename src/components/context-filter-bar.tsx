"use client";

import { XIcon, FilterIcon } from "@/components/icons";

type Props = {
  count: number;
  total: number;
  noun: string;
  filterReason: string;
  onClear: () => void;
};

export function ContextFilterBar({
  count,
  total,
  noun,
  filterReason,
  onClear,
}: Props) {
  return (
    <div className="flex items-center gap-3 bg-(--accent-soft) border border-[rgba(196,121,24,0.24)] rounded-xl px-3.5 py-3 mb-4.5">
      <span className="w-7.5 h-7.5 rounded-lg bg-(--accent) text-(--on-accent) flex items-center justify-center shrink-0">
        <FilterIcon />
      </span>
      <span className="flex-1 min-w-0 text-[13px] leading-snug text-(--ink-body)">
        Showing{" "}
        <b className="font-semibold text-(--ink-heading)">
          {count} {noun}{count !== 1 ? "s" : ""}
        </b>{" "}
        {filterReason}
      </span>
      <button
        onClick={onClear}
        className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-(--accent-text) bg-(--paper-raised) border border-(--line) rounded-[9px] px-3.5 py-2 whitespace-nowrap cursor-pointer transition-colors hover:border-(--accent) font-(family-name:--sans)"
      >
        <XIcon />
        Show all {total}
      </button>
    </div>
  );
}
