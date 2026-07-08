import { db } from "@/server/db";
import {
  user,
  userClasses,
  classes,
  topics,
  masterDocuments,
  compilationSources,
  contributions,
  notifications,
} from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Resend } from "resend";
import {
  renderRankChanged,
  renderMasterDoc,
  renderKicked,
  renderBanned,
  renderUnbanned,
  RANK_LABELS,
} from "@/lib/emails";
import { getBaseUrl } from "@/lib/utils";
import type { ActivityPayload } from "@/lib/activity-log";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Notify <notifications@notifyy.ca>";

async function notifyRemoval(
  classId: string,
  type: "member_kicked" | "member_banned",
  targetId: string,
  actorName: string,
) {
  const [targetUser, classRow] = await Promise.all([
    db
      .select({ email: user.email, notifyKick: user.notifyKick, notifyBanned: user.notifyBanned })
      .from(user)
      .where(eq(user.id, targetId))
      .limit(1),
    db
      .select({ name: classes.name })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1),
  ]);
  if (!targetUser[0] || !classRow[0]) return;
  const className = classRow[0].name;
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: targetId,
    classId,
    type,
    payload: JSON.stringify({ className, actorName }),
  });
  const pref = type === "member_kicked" ? targetUser[0].notifyKick : targetUser[0].notifyBanned;
  if (pref) {
    const render = type === "member_kicked" ? renderKicked : renderBanned;
    const subject =
      type === "member_kicked"
        ? `You were removed from ${className}`
        : `You were banned from ${className}`;
    await resend.emails.send({
      from: FROM,
      to: targetUser[0].email,
      subject,
      html: render({ className, actorName }),
    });
  }
}

export async function triggerNotifications(
  classId: string,
  payload: ActivityPayload,
  topicId?: string | null,
) {
  switch (payload.action) {
    case "rank_changed": {
      const [prefs, targetUser, classRow] = await Promise.all([
        db
          .select({ notifyRankChange: userClasses.notifyRankChange })
          .from(userClasses)
          .where(
            and(
              eq(userClasses.userId, payload.target.id),
              eq(userClasses.classId, classId),
            ),
          )
          .limit(1),
        db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, payload.target.id))
          .limit(1),
        db
          .select({ name: classes.name })
          .from(classes)
          .where(eq(classes.id, classId))
          .limit(1),
      ]);

      if (!targetUser[0] || !classRow[0]) return;

      const url = `${getBaseUrl()}/home/${classId}`;

      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: payload.target.id,
        classId,
        type: "rank_changed",
        payload: JSON.stringify({
          className: classRow[0].name,
          oldRank: payload.oldRank,
          newRank: payload.rank,
          url,
        }),
      });

      if (prefs[0]?.notifyRankChange) {
        await resend.emails.send({
          from: FROM,
          to: targetUser[0].email,
          subject: `You're now a ${RANK_LABELS[payload.rank] ?? payload.rank} in ${classRow[0].name}`,
          html: renderRankChanged({
            className: classRow[0].name,
            oldRank: payload.oldRank,
            newRank: payload.rank,
            url,
          }),
        });
      }
      break;
    }

    case "compilation_completed": {
      if (!topicId) return;

      const [topicRow, classRow, allMembers, latestDocRows] = await Promise.all([
        db
          .select({ name: topics.name })
          .from(topics)
          .where(eq(topics.id, topicId))
          .limit(1),
        db
          .select({ name: classes.name })
          .from(classes)
          .where(eq(classes.id, classId))
          .limit(1),
        db
          .select({
            userId: userClasses.userId,
            email: user.email,
            notifyMasterDoc: userClasses.notifyMasterDoc,
          })
          .from(userClasses)
          .innerJoin(user, eq(userClasses.userId, user.id))
          .where(eq(userClasses.classId, classId)),
        db
          .select({ id: masterDocuments.id })
          .from(masterDocuments)
          .where(
            and(
              eq(masterDocuments.topicId, topicId),
              eq(masterDocuments.status, "ready"),
            ),
          )
          .orderBy(desc(masterDocuments.createdAt))
          .limit(1),
      ]);

      if (!topicRow[0] || !classRow[0] || allMembers.length === 0) return;

      let sourceCount = 0;
      let contributorCount = 0;

      if (latestDocRows[0]) {
        const sourceRows = await db
          .select({
            snapshotUploadedBy: compilationSources.snapshotUploadedBy,
            contributionUploadedBy: contributions.uploadedBy,
          })
          .from(compilationSources)
          .leftJoin(
            contributions,
            eq(compilationSources.contributionId, contributions.id),
          )
          .where(eq(compilationSources.masterDocumentId, latestDocRows[0].id));

        sourceCount = sourceRows.length;
        const contributorIds = new Set(
          sourceRows
            .map((r) => r.contributionUploadedBy ?? r.snapshotUploadedBy)
            .filter(Boolean),
        );
        contributorCount = contributorIds.size;
      }

      const url = `${getBaseUrl()}/home/${classId}/${topicId}`;
      const notifPayload = JSON.stringify({
        className: classRow[0].name,
        topicName: topicRow[0].name,
        url,
      });

      await Promise.all([
        db.insert(notifications).values(
          allMembers.map((m) => ({
            id: crypto.randomUUID(),
            userId: m.userId,
            classId,
            type: "compilation_completed",
            payload: notifPayload,
          })),
        ),
        ...allMembers
          .filter((m) => m.notifyMasterDoc)
          .map((m) =>
            resend.emails.send({
              from: FROM,
              to: m.email,
              subject: `New master document – ${topicRow[0].name}`,
              html: renderMasterDoc({
                className: classRow[0].name,
                topicName: topicRow[0].name,
                sourceCount,
                contributorCount,
                url,
              }),
            }),
          ),
      ]);
      break;
    }

    case "member_kicked":
      await notifyRemoval(classId, "member_kicked", payload.target.id, payload.actor.name);
      break;

    case "member_banned":
      await notifyRemoval(classId, "member_banned", payload.target.id, payload.actor.name);
      break;

    case "member_unbanned": {
      const [targetUser, classRow] = await Promise.all([
        db
          .select({ email: user.email, notifyUnbanned: user.notifyUnbanned })
          .from(user)
          .where(eq(user.id, payload.target.id))
          .limit(1),
        db
          .select({ name: classes.name, code: classes.code })
          .from(classes)
          .where(eq(classes.id, classId))
          .limit(1),
      ]);

      if (!targetUser[0] || !classRow[0]) return;

      const url = `${getBaseUrl()}/home?code=${classRow[0].code}`;

      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: payload.target.id,
        classId,
        type: "member_unbanned",
        payload: JSON.stringify({ className: classRow[0].name, actorName: payload.actor.name, url }),
      });

      if (targetUser[0].notifyUnbanned) {
        await resend.emails.send({
          from: FROM,
          to: targetUser[0].email,
          subject: `Your ban in ${classRow[0].name} has been lifted`,
          html: renderUnbanned({ className: classRow[0].name, actorName: payload.actor.name, url }),
        });
      }
      break;
    }
  }
}
