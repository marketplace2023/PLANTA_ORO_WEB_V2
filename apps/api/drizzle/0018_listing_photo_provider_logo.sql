ALTER TABLE "provider"."providers" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "provider"."providers" ADD COLUMN "logo_mime" varchar(50);--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "image_mime" varchar(50);