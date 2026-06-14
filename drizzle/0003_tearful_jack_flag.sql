ALTER TABLE "class_bans" DROP CONSTRAINT "class_bans_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "class_bans" DROP CONSTRAINT "class_bans_banned_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "class_bans" DROP CONSTRAINT "class_bans_banned_by_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "compile_logs" DROP CONSTRAINT "compile_logs_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "compile_logs" DROP CONSTRAINT "compile_logs_topic_id_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "compile_logs" DROP CONSTRAINT "compile_logs_triggered_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "contributions" DROP CONSTRAINT "contributions_topic_id_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "contributions" DROP CONSTRAINT "contributions_uploaded_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "master_documents" DROP CONSTRAINT "master_documents_topic_id_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "topics" DROP CONSTRAINT "topics_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "topics" DROP CONSTRAINT "topics_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_classes" DROP CONSTRAINT "user_classes_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_classes" DROP CONSTRAINT "user_classes_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_banned_user_id_user_id_fk" FOREIGN KEY ("banned_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bans" ADD CONSTRAINT "class_bans_banned_by_user_id_user_id_fk" FOREIGN KEY ("banned_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_logs" ADD CONSTRAINT "compile_logs_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_logs" ADD CONSTRAINT "compile_logs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_logs" ADD CONSTRAINT "compile_logs_triggered_by_user_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_documents" ADD CONSTRAINT "master_documents_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_classes" ADD CONSTRAINT "user_classes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_classes" ADD CONSTRAINT "user_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;