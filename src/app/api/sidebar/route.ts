import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { getSidebarClasses } from "@/server/queries/sidebar";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json([], { status: 401 });

  const classes = await getSidebarClasses(session.user.id);
  return Response.json(classes);
}
