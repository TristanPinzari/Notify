CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"class_id" text,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_kick" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_banned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_unbanned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_invite" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_classes" ADD COLUMN "notify_kick" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_classes" ADD COLUMN "notify_banned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_classes" ADD COLUMN "notify_unbanned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_userId_idx" ON "notifications" USING btree ("user_id");