"use client";

import { createContext, useContext, useState } from "react";

const SidebarStateCtx = createContext(false);
const SidebarDispatchCtx = createContext<(open: boolean) => void>(() => {});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarStateCtx.Provider value={open}>
      <SidebarDispatchCtx.Provider value={setOpen}>
        {children}
      </SidebarDispatchCtx.Provider>
    </SidebarStateCtx.Provider>
  );
}

export function useSidebarState() {
  return useContext(SidebarStateCtx);
}

export function useSidebarDispatch() {
  return useContext(SidebarDispatchCtx);
}
