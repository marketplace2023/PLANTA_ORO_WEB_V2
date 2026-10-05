ALTER TABLE "catalog"."asset_models" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" ADD COLUMN "image_mime" varchar(50);--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" ADD COLUMN "image_updated_at" timestamp with time zone;