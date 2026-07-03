"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { mutate } from "swr";
import { joinClass } from "@/server/actions/classes";

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
    <div className="flex items-center justify-center h-full text-(--ink-faint) text-[14px]">
      Select a class to get started.
    </div>
  );
}
