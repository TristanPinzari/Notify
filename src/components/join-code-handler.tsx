"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { toast } from "sonner";
import { joinClass } from "@/server/actions/classes";

export function JoinCodeHandler({ code }: { code: string }) {
  const router = useRouter();
  const joining = useRef(false);

  useEffect(() => {
    if (joining.current) return;
    joining.current = true;
    joinClass(code).then((res) => {
      if ("alreadyMember" in res) {
        router.replace(`/home/${res.id}`);
        return;
      }
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Joined class!");
      mutate("/api/sidebar");
      router.replace(`/home/${res.id}`);
    });
  }, [code, router]);

  return null;
}
