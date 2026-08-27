"use server";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/server/db";
import {
  classes,
  compilationSources,
  contributions,
  CType,
  EMethod,
  topics,
  user,
} from "@/server/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import {
  getUserRank,
  isUniqueViolation,
  rateLimit,
  requireOwnerOrDeleteAccess,
  requireRank,
  requireUploadAccess,
  topicBelongsToClass,
} from "./shared";
import { startExtraction } from "@/temporal/extraction";
import { logActivity } from "@/lib/activity-log";
import { stripNullBytes } from "@/lib/utils";
import { UPLOAD_URL_EXPIRES_SEC } from "@/lib/upload-config";
import { normalizeYoutubeUrl } from "@/lib/youtube";

const s3 = new S3Client({ region: process.env.AWS_REGION! });

export async function createUrlContribution(
  classId: string,
  topicId: string,
  data: {
    name: string;
    type: Exclude<CType, "custom">;
    extractionMethod: EMethod;
    url: string;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: createContribution called with no session");
    return { error: "Not authenticated." };
  }
  const limit = await rateLimit(session.user.id, "createContribution");
  if (limit) return limit;
  if (data.name.trim().length === 0)
    return { error: "Contribution name cannot be empty." };
  if (data.name.length > 200)
    return { error: "Contribution name must be 200 characters or fewer." };
  if (data.url.trim().length === 0) return { error: "URL cannot be empty." };
  const url = normalizeYoutubeUrl(data.url);

  try {
    const allowed = await requireUploadAccess(
      classId,
      topicId,
      session.user.id,
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    const id = crypto.randomUUID();
    const [row] = await db
      .insert(contributions)
      .values({
        id,
        topicId,
        uploadedBy: session.user.id,
        name: stripNullBytes(data.name),
        type: data.type,
        extractionMethod: data.extractionMethod,
        url,
        status: "processing",
      })
      .returning({ createdAt: contributions.createdAt });

    startExtraction(id, data.extractionMethod, undefined, url).catch((e) =>
      console.error(
        `ERROR: failed to start extraction for contribution ${id}: `,
        e,
      ),
    );

    logActivity(
      classId,
      session.user.id,
      {
        action: "contribution_uploaded",
        contribution: { id, name: data.name },
      },
      topicId,
    );
    return { id, createdAt: row.createdAt.toISOString() };
  } catch (e) {
    if (isUniqueViolation(e))
      return {
        error: `${data.name} has already been contributed to this topic.`,
      };
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "video/webm": "webm",
};

export async function createFileContribution(
  classId: string,
  topicId: string,
  data: {
    name: string;
    type: Exclude<CType, "custom">;
    extractionMethod: EMethod;
    fileType: string;
    fileSize: number;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: getUploadUrl called with no session");
    return { error: "Not authenticated." };
  }
  const limit = await rateLimit(session.user.id, "createContribution");
  if (limit) return limit;
  if (data.name.trim().length === 0)
    return { error: "Contribution name cannot be empty." };
  if (data.name.length > 200)
    return { error: "Contribution name must be 200 characters or fewer." };
  if (data.fileSize > 500 * 1024 * 1024)
    return { error: "File must be under 500 MB." };

  try {
    const allowed = await requireUploadAccess(
      classId,
      topicId,
      session.user.id,
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    const id = crypto.randomUUID();
    const ext = MIME_EXT[data.fileType] ?? "bin";
    const s3Key = `contributions/${topicId}/${id}.${ext}`;

    const [row] = await db
      .insert(contributions)
      .values({
        id,
        topicId,
        uploadedBy: session.user.id,
        name: stripNullBytes(data.name),
        type: data.type,
        extractionMethod: data.extractionMethod,
        s3Key,
        status: "processing",
      })
      .returning({ createdAt: contributions.createdAt });

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key,
        ContentType: data.fileType,
        ContentLength: data.fileSize,
      }),
      { expiresIn: UPLOAD_URL_EXPIRES_SEC },
    );

    logActivity(
      classId,
      session.user.id,
      {
        action: "contribution_uploaded",
        contribution: { id, name: data.name },
      },
      topicId,
    );

    return { id, createdAt: row.createdAt.toISOString(), uploadUrl };
  } catch (e) {
    if (isUniqueViolation(e))
      return {
        error: `${data.name} has already been contributed to this topic.`,
      };
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function startFileExtraction(contributionId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const [contribution] = await db
      .select({
        extractionMethod: contributions.extractionMethod,
        s3Key: contributions.s3Key,
        url: contributions.url,
        status: contributions.status,
        uploadedBy: contributions.uploadedBy,
      })
      .from(contributions)
      .where(eq(contributions.id, contributionId))
      .limit(1);

    if (!contribution || contribution.uploadedBy !== session.user.id)
      return { error: "Contribution not found." };
    if (contribution.status !== "processing")
      return { error: "Contribution is not pending extraction." };

    const queued = await startExtraction(
      contributionId,
      contribution.extractionMethod,
      contribution.s3Key ?? undefined,
      contribution.url ?? undefined,
    );
    if (!queued)
      return { error: "Extraction service is unavailable. Try again shortly." };
    return { ok: true };
  } catch (e) {
    console.error(`ERROR: triggerExtraction for ${contributionId}:`, e);
    return { error: "Something went wrong." };
  }
}

export async function createCustomContribution(
  classId: string,
  topicId: string,
  data: {
    name: string;
    text: string;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: createCustomContribution called with no session");
    return { error: "Not authenticated." };
  }
  const limit = await rateLimit(session.user.id, "createContribution");
  if (limit) return limit;
  if (data.name.trim().length === 0)
    return { error: "Contribution name cannot be empty." };
  if (data.name.length > 200)
    return { error: "Contribution name must be 200 characters or fewer." };
  if (!data.text) return { error: "No text provided." };
  if (data.text.length > 50000)
    return { error: "Text must be 50,000 characters or fewer." };

  try {
    const allowed = await requireUploadAccess(
      classId,
      topicId,
      session.user.id,
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    const id = crypto.randomUUID();
    const [row] = await db
      .insert(contributions)
      .values({
        id,
        topicId,
        uploadedBy: session.user.id,
        name: stripNullBytes(data.name),
        type: "custom",
        extractionMethod: "text_extraction",
        status: "ready",
        text: stripNullBytes(data.text),
      })
      .returning({ createdAt: contributions.createdAt });

    logActivity(
      classId,
      session.user.id,
      {
        action: "contribution_uploaded",
        contribution: { id, name: data.name },
      },
      topicId,
    );
    return { id, createdAt: row.createdAt.toISOString() };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function getContributionUrl(
  classId: string,
  contributionId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: getContributionUrl called with no session");
    return { error: "Not authenticated." };
  }

  try {
    const rank = await getUserRank(classId, session.user.id);
    if (!rank) {
      console.error(
        `ERROR: user ${session.user.id} is not a member of class ${classId}`,
      );
      return { error: "You are not a member of this class." };
    }

    const [contribution] = await db
      .select({ s3Key: contributions.s3Key, url: contributions.url })
      .from(contributions)
      .innerJoin(topics, eq(contributions.topicId, topics.id))
      .where(
        and(eq(contributions.id, contributionId), eq(topics.classId, classId)),
      )
      .limit(1);
    if (!contribution) {
      console.error(
        `ERROR: contribution ${contributionId} does not belong to class ${classId}`,
      );
      return { error: "Contribution does not exist in this class." };
    }

    if (contribution.url) return { url: contribution.url };

    if (!contribution.s3Key) {
      console.error(`ERROR: contribution ${contributionId} has no file or url`);
      return { error: "No file available for this contribution." };
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: contribution.s3Key,
      }),
      { expiresIn: 300 },
    );

    return { url };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function getContributionStatuses(
  classId: string,
  topicId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: getContributionStatuses called with no session");
    return { error: "Not authenticated." };
  }

  try {
    if (!(await topicBelongsToClass(classId, topicId))) {
      console.error(
        `ERROR: topic ${topicId} does not belong to class ${classId}`,
      );
      return { error: "Topic does not exist in this class." };
    }

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) {
      console.error(
        `ERROR: user ${session.user.id} is not a member of class ${classId}`,
      );
      return { error: "You are not a member of this class." };
    }

    const rows = await db
      .select({
        id: contributions.id,
        name: contributions.name,
        status: contributions.status,
        failureReason: contributions.failureReason,
      })
      .from(contributions)
      .where(eq(contributions.topicId, topicId));

    return { statuses: rows };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function deleteContribution(
  classId: string,
  contributionId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: deleteContribution called with no session");
    return { error: "Not authenticated." };
  }

  try {
    const [contribution] = await db
      .select({
        uploadedBy: contributions.uploadedBy,
        uploaderName: user.name,
        name: contributions.name,
        type: contributions.type,
        s3Key: contributions.s3Key,
        topicId: contributions.topicId,
      })
      .from(contributions)
      .innerJoin(topics, eq(contributions.topicId, topics.id))
      .leftJoin(user, eq(contributions.uploadedBy, user.id))
      .where(
        and(eq(contributions.id, contributionId), eq(topics.classId, classId)),
      )
      .limit(1);
    if (!contribution) {
      console.error(
        `ERROR: contribution ${contributionId} does not belong to class ${classId}`,
      );
      return { error: "Contribution does not exist in this class." };
    }

    const allowed = await requireOwnerOrDeleteAccess(
      classId,
      session.user.id,
      contribution.uploadedBy,
      "delete contributions",
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    await db
      .update(compilationSources)
      .set({
        snapshotName: contribution.name,
        snapshotType: contribution.type,
        snapshotUploadedBy: contribution.uploadedBy,
        snapshotUploaderName: contribution.uploaderName,
      })
      .where(eq(compilationSources.contributionId, contributionId));

    await db.delete(contributions).where(eq(contributions.id, contributionId));

    logActivity(
      classId,
      session.user.id,
      {
        action: "contribution_deleted",
        contributionName: contribution.name,
      },
      contribution.topicId,
    );

    if (contribution.s3Key) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: contribution.s3Key,
          }),
        );
      } catch (cleanupError) {
        console.error(
          `ERROR deleting S3 object for contribution ${contributionId}: `,
          cleanupError,
        );
      }
    }

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function restartExtraction(
  classId: string,
  topicId: string,
  contributionId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: restartExtraction called with no session");
    return { error: "Not authenticated." };
  }

  try {
    const allowed = await requireUploadAccess(
      classId,
      topicId,
      session.user.id,
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    const [contribution] = await db
      .select({
        extractionMethod: contributions.extractionMethod,
        s3Key: contributions.s3Key,
        url: contributions.url,
        status: contributions.status,
        name: contributions.name,
      })
      .from(contributions)
      .where(
        and(
          eq(contributions.id, contributionId),
          eq(contributions.topicId, topicId),
        ),
      )
      .limit(1);

    if (!contribution) return { error: "This contribution does not exist." };

    // Atomic check-and-set: only updates if not already processing, preventing duplicate workflows.
    const [locked] = await db
      .update(contributions)
      .set({ status: "processing" })
      .where(
        and(
          eq(contributions.id, contributionId),
          ne(contributions.status, "processing"),
        ),
      )
      .returning({ id: contributions.id });
    if (!locked)
      return { error: "This contribution is already being processed." };

    const queued = await startExtraction(
      contributionId,
      contribution.extractionMethod,
      contribution.s3Key ?? undefined,
      contribution.url ?? undefined,
    );

    if (!queued)
      return { error: "Extraction service is unavailable. Try again shortly." };

    logActivity(
      classId,
      session.user.id,
      {
        action: "contribution_reprocessed",
        contribution: { id: contributionId, name: contribution.name },
      },
      topicId,
    );
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function getContributionText(
  classId: string,
  contributionId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: getContributionText called with no session");
    return { error: "Not authenticated." };
  }

  try {
    const rank = await getUserRank(classId, session.user.id);
    if (!rank) {
      console.error(
        `ERROR: user ${session.user.id} is not a member of class ${classId}`,
      );
      return { error: "You are not a member of this class." };
    }

    const [contribution] = await db
      .select({ text: contributions.text })
      .from(contributions)
      .innerJoin(topics, eq(contributions.topicId, topics.id))
      .where(
        and(eq(contributions.id, contributionId), eq(topics.classId, classId)),
      )
      .limit(1);

    if (!contribution) {
      console.error(
        `ERROR: contribution ${contributionId} does not belong to class ${classId}`,
      );
      return { error: "Contribution not found." };
    }

    return { text: contribution.text };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function editContribution(
  classId: string,
  topicId: string,
  contributionId: string,
  data: {
    name?: string;
    extractionMethod?: EMethod;
    text?: string;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: editContribution called with no session");
    return { error: "Not authenticated." };
  }

  try {
    if (!(await topicBelongsToClass(classId, topicId))) {
      console.error(
        `ERROR: topic ${topicId} does not belong to class ${classId}`,
      );
      return { error: "Topic does not exist in this class." };
    }

    const [contribution] = await db
      .select({
        status: contributions.status,
        name: contributions.name,
        topicId: contributions.topicId,
        uploadedBy: contributions.uploadedBy,
        type: contributions.type,
      })
      .from(contributions)
      .innerJoin(topics, eq(contributions.topicId, topics.id))
      .where(
        and(eq(contributions.id, contributionId), eq(topics.classId, classId)),
      )
      .limit(1);
    if (!contribution) {
      console.error(
        `ERROR: contribution ${contributionId} does not belong to class ${classId}`,
      );
      return { error: "This contribution does not exist." };
    }
    if (contribution.status === "processing")
      return { error: "This contribution is still being processed." };

    const allowed = await requireOwnerOrDeleteAccess(
      classId,
      session.user.id,
      contribution.uploadedBy,
      "edit contributions",
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    if (data.name !== undefined) {
      if (data.name.trim().length === 0)
        return { error: "Contribution name cannot be empty." };
      if (data.name.length > 200)
        return { error: "Contribution name must be 200 characters or fewer." };
    }
    if (data.text !== undefined && data.text.length > 50000)
      return { error: "Text must be 50,000 characters or fewer." };
    if (data.extractionMethod !== undefined && contribution.type === "custom")
      return { error: "Custom contributions do not use an extraction method." };

    await db
      .update(contributions)
      .set({
        name: data.name != null ? stripNullBytes(data.name) : undefined,
        extractionMethod: data.extractionMethod,
        text: data.text != null ? stripNullBytes(data.text) : undefined,
        ...(data.text !== undefined
          ? { manuallyEdited: true, status: "ready", failureReason: null }
          : {}),
      })
      .where(eq(contributions.id, contributionId));

    logActivity(
      classId,
      session.user.id,
      {
        action: "contribution_edited",
        contribution: {
          id: contributionId,
          name: data.name ?? contribution.name,
        },
      },
      contribution.topicId,
    );
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function setContributionPin(
  classId: string,
  contributionId: string,
  pinned: boolean,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: setContributionPin called with no session");
    return { error: "Not authenticated." };
  }

  try {
    const [cls] = await db
      .select({ minRankPinContribution: classes.minRankPinContribution })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls) {
      console.error(`ERROR: class ${classId} does not exist`);
      return { error: "Class does not exist." };
    }

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls.minRankPinContribution,
      "pin",
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    const [contribution] = await db
      .select({
        name: contributions.name,
        topicId: contributions.topicId,
      })
      .from(contributions)
      .innerJoin(topics, eq(contributions.topicId, topics.id))
      .where(
        and(eq(contributions.id, contributionId), eq(topics.classId, classId)),
      )
      .limit(1);
    if (!contribution)
      return { error: "This contribution doesn't belong to this class." };

    await db
      .update(contributions)
      .set({ pinned })
      .where(eq(contributions.id, contributionId));

    logActivity(
      classId,
      session.user.id,
      {
        action: pinned ? "contribution_pinned" : "contribution_unpinned",
        contribution: { id: contributionId, name: contribution.name },
      },
      contribution.topicId,
    );
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}
