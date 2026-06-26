import type { Metadata } from "next";
import { MembersPageContent } from "@/app/home/[classId]/members-page";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <MembersPageContent classId={classId} />;
}
