"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DocIcon,
  PinIcon,
  CollectionIcon,
  MembersIcon,
  SettingsIcon,
} from "@/components/icons";

type Props = {
  base: string;
};

const TABS = [
  { label: "Master Doc", href: "", icon: <DocIcon /> },
  { label: "Pinned", href: "/pinned", icon: <PinIcon /> },
  { label: "Collection", href: "/collection", icon: <CollectionIcon /> },
  { label: "Members", href: "/members", icon: <MembersIcon /> },
  { label: "Settings", href: "/settings", icon: <SettingsIcon /> },
];

export function TopicTabs({ base }: Props) {
  const pathname = usePathname();

  return (
    <div className="overflow-hidden flex items-center gap-0.5 px-5.5 border-b border-(--line-soft) bg-(--paper) shrink-0 overflow-x-auto">
      {TABS.map((tab) => {
        const href = base + tab.href;
        const on = tab.href === "" ? pathname === base : pathname === href;
        return (
          <Link key={tab.label} href={href} className={`tab${on ? " on" : ""}`}>
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
