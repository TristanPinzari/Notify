"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopicIcon, MembersIcon, SettingsIcon } from "@/components/icons";

type Props = {
  base: string;
};

const TABS = [
  { label: "Topics", href: "", icon: <TopicIcon /> },
  { label: "Members", href: "/members", icon: <MembersIcon /> },
  { label: "Settings", href: "/settings", icon: <SettingsIcon /> },
];

export function ClassTabs({ base }: Props) {
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
