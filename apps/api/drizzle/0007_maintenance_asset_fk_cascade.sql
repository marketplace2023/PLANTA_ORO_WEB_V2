ALTER TABLE "maintenance"."plans" DROP CONSTRAINT "plans_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "maintenance"."work_orders" DROP CONSTRAINT "work_orders_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "maintenance"."plans" ADD CONSTRAINT "plans_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_orders" ADD CONSTRAINT "work_orders_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE cascade ON UPDATE no action;