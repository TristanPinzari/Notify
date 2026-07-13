"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DocIcon,
  CollectionIcon,
  MembersIcon,
  SettingsIcon,
} from "@/components/icons";

type Props = {
  base: string;
};

export function TopicTabs({ base }: Props) {
  const pathname = usePathname();
  const tabs = [
    { label: "Master Doc", href: base, icon: <DocIcon /> },
    {
      label: "Collection",
      href: base + "/collection",
      icon: <CollectionIcon />,
    },
    { label: "Members", href: base + "/members", icon: <MembersIcon /> },
    { label: "Settings", href: base + "/settings", icon: <SettingsIcon /> },
  ];

  return (
    <div className="flex items-center gap-0.5 px-5.5 border-b border-(--line-soft) bg-(--paper) shrink-0">
      {tabs.map((tab) => {
        const on = pathname === tab.href;
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`tab${on ? " on" : ""}`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
