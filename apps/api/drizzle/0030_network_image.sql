ALTER TABLE "plant"."network_master" ADD COLUMN "layout_image_key" text;--> statement-breakpoint
ALTER TABLE "plant"."network_master" ADD COLUMN "layout_image_mime" varchar(50);--> statement-breakpoint
ALTER TABLE "plant"."network_master" ADD COLUMN "layout_image_updated_at" timestamp with time zone;