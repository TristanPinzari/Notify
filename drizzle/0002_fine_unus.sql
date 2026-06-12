ALTER TABLE "classes" ADD COLUMN "min_rank_create_topic" "rank" DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_rank_delete_topic" "rank" DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_rank_upload_contribution" "rank" DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_rank_delete_contribution" "rank" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_rank_trigger_compilation" "rank" DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_rank_edit_compilation" "rank" DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_rank_ban_users" "rank" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_rank_kick_users" "rank" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_rank_change_ranks" "rank" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" DROP COLUMN "can_admin_manage_users";--> statement-breakpoint
ALTER TABLE "classes" DROP COLUMN "min_edit_rank";--> statement-breakpoint
DROP TYPE "public"."min_edit_rank";