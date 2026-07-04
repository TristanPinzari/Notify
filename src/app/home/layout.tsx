import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSidebarClasses } from "@/server/queries/sidebar";
import { Sidebar } from "@/components/sidebar";
import type { ReactNode } from "react";

export default async function HomeLayout({
  children,
}: {
  children: ReactNode;
}) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) {
    const search = headersList.get("x-search") ?? "";
    redirect(`/sign-in?callbackUrl=${encodeURIComponent("/home" + search)}`);
  }

  const sidebarClasses = await getSidebarClasses(session.user.id);

  return (
    <div className="flex h-screen">
      <Sidebar
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
        initialClasses={sidebarClasses}
      />
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
