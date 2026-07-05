CREATE TYPE "public"."contribution_status" AS ENUM('processing', 'ready', 'compiled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."contribution_type" AS ENUM('pdf', 'image', 'audio', 'youtube', 'link', 'text', 'custom');--> statement-breakpoint
CREATE TYPE "public"."doc_conflict_resolution" AS ENUM('trust_pinned', 'trust_majority', 'flag_all');--> statement-breakpoint
CREATE TYPE "public"."doc_depth" AS ENUM('concise', 'standard', 'detailed');--> statement-breakpoint
CREATE TYPE "public"."doc_fact_check" AS ENUM('none', 'flag', 'replace');--> statement-breakpoint
CREATE TYPE "public"."doc_output_type" AS ENUM('prose', 'bullet', 'both');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('compiling', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."extraction_method" AS ENUM('text_extraction', 'handwriting_ocr', 'speech_to_text', 'youtube_transcript', 'web_scrape');--> statement-breakpoint
CREATE TYPE "public"."pdf_status" AS ENUM('pending', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rank" AS ENUM('owner', 'admin', 'contributor', 'viewer');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"topic_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"banned_user_id" text NOT NULL,
	"banned_by_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_bans_class_id_banned_user_id_unique" UNIQUE("class_id","banned_user_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_rank" "rank" DEFAULT 'contributor' NOT NULL,
	"min_rank_create_topic" "rank" DEFAULT 'contributor' NOT NULL,
	"min_rank_delete_topic" "rank" DEFAULT 'owner' NOT NULL,
	"min_rank_upload_contribution" "rank" DEFAULT 'contributor' NOT NULL,
	"min_rank_delete_contribution" "rank" DEFAULT 'admin' NOT NULL,
	"min_rank_trigger_compilation" "rank" DEFAULT 'contributor' NOT NULL,
	"min_rank_edit_compilation" "rank" DEFAULT 'contributor' NOT NULL,
	"min_rank_invite" "rank" DEFAULT 'admin' NOT NULL,
	"min_rank_ban_users" "rank" DEFAULT 'admin' NOT NULL,
	"min_rank_kick_users" "rank" DEFAULT 'admin' NOT NULL,
	"min_rank_change_ranks" "rank" DEFAULT 'admin' NOT NULL,
	"min_rank_pin_contribution" "rank" DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "compilation_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"master_document_id" text NOT NULL,
	"contribution_id" text,
	"snapshot_name" text,
	"snapshot_type" "contribution_type",
	"snapshot_uploaded_by" text,
	"snapshot_uploader_name" text
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"topic_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"type" "contribution_type" NOT NULL,
	"extraction_method" "extraction_method" NOT NULL,
	"status" "contribution_status" DEFAULT 'processing' NOT NULL,
	"text" text,
	"s3_key" text,
	"url" text,
	"failure_reason" text,
	"manually_edited" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_topic_id_url_unique" UNIQUE("topic_id","url")
);
--> statement-breakpoint
CREATE TABLE "email_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"class_id" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"triggered_by" text NOT NULL,
	"content" text,
	"status" "doc_status" DEFAULT 'compiling' NOT NULL,
	"output_type" "doc_output_type" DEFAULT 'both' NOT NULL,
	"depth" "doc_depth" DEFAULT 'standard' NOT NULL,
	"conflict_resolution" "doc_conflict_resolution" DEFAULT 'trust_pinned' NOT NULL,
	"fact_check" "doc_fact_check" DEFAULT 'flag' NOT NULL,
	"sources_inline" boolean DEFAULT false NOT NULL,
	"manually_edited" boolean DEFAULT false NOT NULL,
	"failure_reason" text,
	"pdf_s3_key" text,
	"pdf_status" "pdf_status" DEFAULT 'pending' NOT NULL,
	"pdf_generation_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"name" text DEFAULT 'Untitled topic' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_classes" (
	"user_id" text NOT NULL,
	"class_id" text NOT NULL,
	"rank" "rank" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_classes_user_id_class_id_pk" PRIMARY KEY("user_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_banned_user_id_user_id_fk" FOREIGN KEY ("banned_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_banned_by_user_id_user_id_fk" FOREIGN KEY ("banned_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compilation_sources" ADD CONSTRAINT "compilation_sources_master_document_id_master_documents_id_fk" FOREIGN KEY ("master_document_id") REFERENCES "public"."master_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compilation_sources" ADD CONSTRAINT "compilation_sources_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_invites" ADD CONSTRAINT "email_invites_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_invites" ADD CONSTRAINT "email_invites_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_documents" ADD CONSTRAINT "master_documents_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_documents" ADD CONSTRAINT "master_documents_triggered_by_user_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_classes" ADD CONSTRAINT "user_classes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_classes" ADD CONSTRAINT "user_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "compilation_sources_master_doc_idx" ON "compilation_sources" USING btree ("master_document_id");--> statement-breakpoint
CREATE INDEX "email_invites_dedup_idx" ON "email_invites" USING btree ("sender_id","recipient_email","class_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");