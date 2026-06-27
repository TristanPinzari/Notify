import type { Metadata } from "next";
import { MembersPageContent } from "@/app/home/[classId]/members-page";
import { parseIds } from "@/lib/utils";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; topicId: string }>;
  searchParams: Promise<{ members?: string; reason?: string }>;
}) {
  const { classId } = await params;
  const { members, reason } = await searchParams;
  const highlightMembers = parseIds(members);
  return <MembersPageContent classId={classId} highlightMembers={highlightMembers} filterReason={reason} />;
}
