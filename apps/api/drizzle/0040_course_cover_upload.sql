ALTER TABLE "lms"."courses" ADD COLUMN "cover_key" text;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "cover_mime" varchar(100);--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "cover_updated_at" timestamp with time zone;