ALTER TABLE "user" ADD COLUMN "notify_rank_change" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_master_doc" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_digest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_classes" ADD COLUMN "notify_rank_change" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_classes" ADD COLUMN "notify_master_doc" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_classes" ADD COLUMN "notify_digest" boolean DEFAULT false NOT NULL;