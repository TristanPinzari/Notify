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
  contributions,
  CType,
  EMethod,
  topics,
} from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import {
  contributionBelongsToClass,
  getUserRank,
  isUniqueViolation,
  requireRank,
  topicBelongsToClass,
} from "./shared";
import { getTemporalClient } from "@/temporal/client";
import type { ExtractionInput } from "@/temporal/workflows";

const s3 = new S3Client({ region: process.env.AWS_REGION! });

async function startExtraction(
  id: string,
  extractionMethod: EMethod,
  s3Key?: string,
  url?: string,
) {
  const temporalClient = await getTemporalClient();
  const input: ExtractionInput = {
    contributionId: id,
    extractionMethod: extractionMethod,
    s3Key,
    url: url,
  };
  await temporalClient.workflow.start("extractContribution", {
    args: [input],
    taskQueue: "main",
    workflowId: `extract-${id}-${Date.now()}`,
  });
}

export async function createContribution(
  classId: string,
  topicId: string,
  data: {
    name: string;
    type: Exclude<CType, "custom">;
    extractionMethod: EMethod;
    url?: string;
    file?: File;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: createContribution called with no session");
    return { error: "Not authenticated." };
  }

  let s3Key: string | undefined;

  try {
    if (!(await topicBelongsToClass(classId, topicId))) {
      console.error(
        `ERROR: topic ${topicId} does not belong to class ${classId}`,
      );
      return { error: "Topic does not exist in this class." };
    }

    const [cls] = await db
      .select({ minRankUploadContribution: classes.minRankUploadContribution })
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
      cls.minRankUploadContribution,
      "upload",
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    if (!data.file && !data.url) {
      console.error("ERROR: createContribution called with no file or url");
      return { error: "No file or URL provided." };
    }

    const id = crypto.randomUUID();
    if (data.file) {
      const buffer = Buffer.from(await data.file.arrayBuffer());
      const ext = data.file.name.split(".").pop();
      s3Key = `contributions/${topicId}/${id}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
          Body: buffer,
          ContentType: data.file.type,
        }),
      );
    }

    const [row] = await db
      .insert(contributions)
      .values({
        id,
        topicId,
        uploadedBy: session.user.id,
        name: data.name,
        type: data.type,
        extractionMethod: data.extractionMethod,
        url: data.url,
        s3Key,
        status: "processing",
      })
      .returning({ createdAt: contributions.createdAt });

    startExtraction(id, data.extractionMethod, s3Key, data.url).catch((e) =>
      console.error(
        `ERROR: failed to start extraction for contribution ${id}: `,
        e,
      ),
    );

    return { id, createdAt: row.createdAt.toISOString() };
  } catch (e) {
    if (s3Key) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: s3Key,
          }),
        );
      } catch (cleanupError) {
        console.error("ERROR cleaning up orphaned S3 object: ", cleanupError);
      }
    }
    if (isUniqueViolation(e))
      return {
        error: `${data.name} has already been contributed to this topic.`,
      };
    console.error("ERROR: ", e);
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

  try {
    if (!(await topicBelongsToClass(classId, topicId))) {
      console.error(
        `ERROR: topic ${topicId} does not belong to class ${classId}`,
      );
      return { error: "Topic does not exist in this class." };
    }

    const [cls] = await db
      .select({ minRankUploadContribution: classes.minRankUploadContribution })
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
      cls.minRankUploadContribution,
      "upload",
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    if (!data.text) {
      console.error("ERROR: createCustomContribution called without text");
      return { error: "No text provided." };
    }

    const id = crypto.randomUUID();
    const [row] = await db
      .insert(contributions)
      .values({
        id,
        topicId,
        uploadedBy: session.user.id,
        name: data.name,
        type: "custom",
        extractionMethod: "text_extraction",
        status: "ready",
        text: data.text,
      })
      .returning({ createdAt: contributions.createdAt });

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

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) {
      console.error(
        `ERROR: user ${session.user.id} is not a member of class ${classId}`,
      );
      return { error: "You are not a member of this class." };
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
        s3Key: contributions.s3Key,
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
      return { error: "Contribution does not exist in this class." };
    }

    if (contribution.uploadedBy !== session.user.id) {
      const [cls] = await db
        .select({
          minRankDeleteContribution: classes.minRankDeleteContribution,
        })
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
        cls.minRankDeleteContribution,
        "delete contributions",
      );
      if ("error" in allowed) {
        console.error(`ERROR: ${allowed.error}`);
        return allowed;
      }
    }

    await db.delete(contributions).where(eq(contributions.id, contributionId));

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
    if (!(await topicBelongsToClass(classId, topicId))) {
      console.error(
        `ERROR: topic ${topicId} does not belong to class ${classId}`,
      );
      return { error: "Topic does not exist in this class." };
    }

    const [cls] = await db
      .select({ minRankUploadContribution: classes.minRankUploadContribution })
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
      cls.minRankUploadContribution,
      "upload",
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    const contribution = await db
      .select({
        extractionMethod: contributions.extractionMethod,
        s3Key: contributions.s3Key,
        url: contributions.url,
        status: contributions.status,
      })
      .from(contributions)
      .where(eq(contributions.id, contributionId))
      .limit(1);

    if (!contribution[0]) return { error: "This contribution does not exist." };
    if (contribution[0].status === "processing")
      return { error: "This contribution is already being processed." };

    await db
      .update(contributions)
      .set({ status: "processing" })
      .where(eq(contributions.id, contributionId));

    await startExtraction(
      contributionId,
      contribution[0].extractionMethod,
      contribution[0].s3Key || undefined,
      contribution[0].url || undefined,
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

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) {
      console.error(
        `ERROR: user ${session.user.id} is not a member of class ${classId}`,
      );
      return { error: "You are not a member of this class." };
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

    const [cls] = await db
      .select({ minRankUploadContribution: classes.minRankUploadContribution })
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
      cls.minRankUploadContribution,
      "upload",
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    const [contribution] = await db
      .select({ status: contributions.status })
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

    await db
      .update(contributions)
      .set({
        name: data.name,
        extractionMethod: data.extractionMethod,
        text: data.text,
        manuallyEdited: true,
        ...(data.text !== undefined
          ? { status: "ready", failureReason: null }
          : {}),
      })
      .where(eq(contributions.id, contributionId));

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

    if (!(await contributionBelongsToClass(classId, contributionId)))
      return { error: "This contribution doesn't belong to this class." };

    await db
      .update(contributions)
      .set({ pinned })
      .where(eq(contributions.id, contributionId));

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}
