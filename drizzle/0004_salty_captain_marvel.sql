CREATE TYPE "public"."extraction_method" AS ENUM('text_extraction', 'handwriting_ocr', 'speech_to_text', 'youtube_transcript', 'web_scrape');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "contributions" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."contribution_type";--> statement-breakpoint
CREATE TYPE "public"."contribution_type" AS ENUM('pdf', 'image', 'audio', 'youtube', 'link', 'text');--> statement-breakpoint
ALTER TABLE "contributions" ALTER COLUMN "type" SET DATA TYPE "public"."contribution_type" USING "type"::"public"."contribution_type";--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "extraction_method" "extraction_method" NOT NULL;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "processing_status" "processing_status" DEFAULT 'pending' NOT NULL;