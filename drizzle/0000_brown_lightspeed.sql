CREATE TYPE "public"."contribution_type" AS ENUM('yt_link', 'pdf', 'image', 'txt');--> statement-breakpoint
CREATE TYPE "public"."min_edit_rank" AS ENUM('owner', 'admin', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."rank" AS ENUM('owner', 'admin', 'contributor', 'viewer');--> statement-breakpoint
CREATE TABLE "class_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"banned_user_id" text NOT NULL,
	"banned_by_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_bans_class_id_banned_user_id_unique" UNIQUE("class_id","banned_user_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_rank" "rank" DEFAULT 'contributor' NOT NULL,
	"can_admin_manage_users" boolean DEFAULT false NOT NULL,
	"min_edit_rank" "min_edit_rank" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "compile_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"triggered_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"topic_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"type" "contribution_type" NOT NULL,
	"text" text,
	"s3_key" text,
	"url" text,
	"is_compiled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"content" text NOT NULL,
	"previous_content" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"name" text DEFAULT 'Untitled topic' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_classes" (
	"user_id" text NOT NULL,
	"class_id" text NOT NULL,
	"rank" "rank" NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_classes_user_id_class_id_pk" PRIMARY KEY("user_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_banned_user_id_user_id_fk" FOREIGN KEY ("banned_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_banned_by_user_id_user_id_fk" FOREIGN KEY ("banned_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_logs" ADD CONSTRAINT "compile_logs_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_logs" ADD CONSTRAINT "compile_logs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_logs" ADD CONSTRAINT "compile_logs_triggered_by_user_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_documents" ADD CONSTRAINT "master_documents_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_classes" ADD CONSTRAINT "user_classes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_classes" ADD CONSTRAINT "user_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;