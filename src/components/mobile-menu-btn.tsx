"use client";

import { MenuIcon } from "@/components/icons";
import { useSidebarDispatch } from "@/components/sidebar-provider";

export function MobileMenuButton({ className }: { className?: string }) {
  const setOpen = useSidebarDispatch();
  return (
    <button
      className={`mobile-menu-btn icon-btn shrink-0${className ? ` ${className}` : ""}`}
      aria-label="Open navigation"
      onClick={() => setOpen(true)}
    >
      <MenuIcon />
    </button>
  );
}
