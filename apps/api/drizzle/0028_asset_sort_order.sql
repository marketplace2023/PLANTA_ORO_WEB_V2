ALTER TABLE "asset"."assets" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Orden inicial por planta: el que ya se veía (por tag). Valores únicos por planta; los nuevos activos van al final.
UPDATE "asset"."assets" a SET "sort_order" = r.n
FROM (SELECT id, row_number() OVER (PARTITION BY plant_id ORDER BY tag, id) AS n FROM "asset"."assets") r
WHERE a.id = r.id;
