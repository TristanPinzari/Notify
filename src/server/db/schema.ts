import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  primaryKey,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const rank = pgEnum("rank", ["owner", "admin", "contributor", "viewer"]);
export const RANK_VALUE = {
  owner: 4,
  admin: 3,
  contributor: 2,
  viewer: 1,
} as const;

export const contributionType = pgEnum("contribution_type", [
  "pdf",
  "image",
  "audio",
  "youtube",
  "link",
  "text",
]);
export const extractionMethod = pgEnum("extraction_method", [
  "text_extraction",
  "handwriting_ocr",
  "speech_to_text",
  "youtube_transcript",
  "web_scrape",
]);
export const processingStatus = pgEnum("processing_status", [
  "processing",
  "ready",
  "failed",
]);

export type CType = (typeof contributionType.enumValues)[number];
export type PStatus = (typeof processingStatus.enumValues)[number];
export type EMethod = (typeof extractionMethod.enumValues)[number];

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const classes = pgTable("classes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  defaultRank: rank("default_rank").notNull().default("contributor"),
  minRankCreateTopic: rank("min_rank_create_topic")
    .notNull()
    .default("contributor"),
  minRankDeleteTopic: rank("min_rank_delete_topic").notNull().default("owner"),
  minRankUploadContribution: rank("min_rank_upload_contribution")
    .notNull()
    .default("contributor"),
  minRankDeleteContribution: rank("min_rank_delete_contribution")
    .notNull()
    .default("admin"),
  minRankTriggerCompilation: rank("min_rank_trigger_compilation")
    .notNull()
    .default("contributor"),
  minRankEditCompilation: rank("min_rank_edit_compilation")
    .notNull()
    .default("contributor"),
  minRankBanUsers: rank("min_rank_ban_users").notNull().default("admin"),
  minRankKickUsers: rank("min_rank_kick_users").notNull().default("admin"),
  minRankChangeRanks: rank("min_rank_change_ranks").notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userClasses = pgTable(
  "user_classes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    rank: rank("rank").notNull(),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.classId] })],
);

export const classBans = pgTable(
  "class_bans",
  {
    id: text("id").primaryKey(),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    bannedUserId: text("banned_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bannedByUserId: text("banned_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.classId, t.bannedUserId)],
);

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Untitled topic"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const masterDocuments = pgTable("master_documents", {
  id: text("id").primaryKey(),
  topicId: text("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  previousContent: text("previous_content"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contributions = pgTable("contributions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  topicId: text("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: contributionType("type").notNull(),
  extractionMethod: extractionMethod("extraction_method").notNull(),
  processingStatus: processingStatus("processing_status")
    .notNull()
    .default("processing"),
  text: text("text"),
  s3Key: text("s3_key"),
  url: text("url"),
  isCompiled: boolean("is_compiled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const compileLogs = pgTable("compile_logs", {
  id: text("id").primaryKey(),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  topicId: text("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  triggeredBy: text("triggered_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export type Rank = (typeof rank.enumValues)[number];
export type ClassSettings = Partial<
  Pick<
    typeof classes.$inferSelect,
    | "name"
    | "defaultRank"
    | "minRankCreateTopic"
    | "minRankDeleteTopic"
    | "minRankUploadContribution"
    | "minRankDeleteContribution"
    | "minRankTriggerCompilation"
    | "minRankEditCompilation"
    | "minRankBanUsers"
    | "minRankKickUsers"
    | "minRankChangeRanks"
  >
>;
