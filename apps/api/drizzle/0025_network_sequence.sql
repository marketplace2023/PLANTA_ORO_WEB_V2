ALTER TABLE "plant"."network_master" ADD COLUMN "sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Orden de las redes base: Procesos, Potencia, IoT, Comunicaciones, Calidad, Laboratorios, Mantenimiento, Requisiciones,
-- Ofertas y Cámaras. Las redes creadas después (sin orden propio) quedan al final, ordenadas por código.
UPDATE "plant"."network_master" SET "sequence" = CASE "code"
  WHEN 'FUR-PROC' THEN 1 WHEN 'FUR-PTE' THEN 2 WHEN 'FUR-IOT' THEN 3 WHEN 'FUR-GPON' THEN 4 WHEN 'FUR-CC' THEN 5
  WHEN 'FUR-LAB' THEN 6 WHEN 'FUR-MNT' THEN 7 WHEN 'FUR-RQ' THEN 8 WHEN 'FUR-OF' THEN 9 WHEN 'FUR-CAM' THEN 10
  ELSE 100 END
WHERE "sequence" = 0;
