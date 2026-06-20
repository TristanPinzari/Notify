ALTER TYPE "public"."processing_status" RENAME TO "contribution_status";--> statement-breakpoint
ALTER TYPE "public"."contribution_status" ADD VALUE 'compiled' BEFORE 'failed';--> statement-breakpoint
ALTER TABLE "contributions" RENAME COLUMN "processing_status" TO "status";--> statement-breakpoint
ALTER TABLE "contributions" DROP COLUMN "is_compiled";