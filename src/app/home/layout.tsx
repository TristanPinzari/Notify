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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

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
