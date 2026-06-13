"use client";

import { authClient } from "@/lib/auth-client";

export default function page() {
  const { data: session } = authClient.useSession();
  return <div>Hello {session?.user.name}</div>;
}
