import type { Metadata } from "next";
import { MembersPageContent } from "@/app/home/[classId]/members-page";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; topicId: string }>;
  searchParams: Promise<{ members?: string }>;
}) {
  const { classId } = await params;
  const { members } = await searchParams;
  const highlightMembers = members ? members.split(",").filter(Boolean) : undefined;
  return <MembersPageContent classId={classId} highlightMembers={highlightMembers} />;
}
