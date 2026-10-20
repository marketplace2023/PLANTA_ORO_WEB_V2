ALTER TABLE "catalog"."asset_families" ADD COLUMN "category_code" varchar(20);--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" ADD COLUMN "catalog_tag" varchar(100);--> statement-breakpoint
ALTER TABLE "catalog"."asset_families" ADD CONSTRAINT "asset_families_category_code_unique" UNIQUE("category_code");--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" ADD CONSTRAINT "asset_models_catalog_tag_unique" UNIQUE("catalog_tag");
