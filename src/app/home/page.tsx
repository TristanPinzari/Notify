"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { mutate } from "swr";
import { joinClass } from "@/server/actions/classes";
import { MobileMenuButton } from "@/components/mobile-menu-btn";

export default function HomePage() {
  const router = useRouter();
  const code = useSearchParams().get("code");
  const joining = useRef(false);

  useEffect(() => {
    if (!code || joining.current) return;
    joining.current = true;
    joinClass(code).then((res) => {
      if ("alreadyMember" in res) {
        router.replace(`/home/${res.id}`);
        return;
      }
      if ("error" in res) return toast.error(res.error);
      toast.success("Joined class!");
      mutate("/api/sidebar");
      router.replace(`/home/${res.id}`);
    });
  }, [code, router]);

  return (
    <div className="flex flex-col h-full">
      <div className="justify-between hidden max-[1200px]:flex h-14 shrink-0 items-center gap-3 px-5 border-b border-(--line-soft) bg-(--paper)">
        <span className="side-brand text-[22px]">
          <span className="mk">N</span>otify
        </span>
        <MobileMenuButton />
      </div>
      <div className="flex-1 flex items-center justify-center text-(--ink-faint) text-[14px]">
        Select a class to get started.
      </div>
    </div>
  );
}
