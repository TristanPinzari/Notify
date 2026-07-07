import { db } from "@/server/db";
import { activityLogs } from "@/server/db/schema";
import type { Rank } from "@/server/db/schema";
import { triggerEmailNotifications } from "@/lib/email-notifications";

export const MEMBER_LOSS_ACTIONS = [
  "member_left",
  "member_kicked",
  "member_banned",
] as const;

export type MemberRef = { id: string; name: string };
export type TopicRef  = { id: string; name: string };
export type ContribRef = { id: string; name: string };

export type ActivityPayload =
  // ── class scope ──────────────────────────────────────────────────
  | { action: "member_joined" }
  | { action: "member_left" }
  | { action: "member_kicked";   target: MemberRef }
  | { action: "member_banned";   target: MemberRef }
  | { action: "member_unbanned"; target: MemberRef }
  | { action: "rank_changed";    target: MemberRef; rank: Rank; oldRank: Rank }
  | { action: "topic_created";   topic: TopicRef }
  | { action: "topic_deleted";   topicName: string }
  | { action: "settings_changed" }
  | { action: "code_regenerated" }
  // ── topic scope (topicId set on row) ─────────────────────────────
  | { action: "contribution_uploaded";  contribution: ContribRef }
  | { action: "contribution_deleted";   contributionName: string }
  | { action: "contribution_edited";    contribution: ContribRef }
  | { action: "contribution_pinned";    contribution: ContribRef }
  | { action: "contribution_unpinned";    contribution: ContribRef }
  | { action: "contribution_reprocessed"; contribution: ContribRef }
  | { action: "topic_renamed";          oldName: string; newName: string }
  | { action: "compilation_triggered" }
  | { action: "compilation_completed" }
  | { action: "compilation_failed" }

export function logActivity(
  classId: string,
  userId: string | null,
  payload: ActivityPayload,
  topicId?: string | null,
) {
  const { action, ...metadata } = payload;
  db.insert(activityLogs)
    .values({
      id: crypto.randomUUID(),
      classId,
      topicId: topicId ?? null,
      userId,
      action,
      metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
    })
    .catch((e) => console.error("Failed to log activity:", e));
  triggerEmailNotifications(classId, payload, topicId).catch(
    (e) => console.error("Failed to send notification email:", e),
  );
}
