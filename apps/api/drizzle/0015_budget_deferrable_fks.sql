-- Los FK "sin cascada" del módulo de presupuestos protegen contra borrar un APU, recurso o proyecto en uso,
-- pero Postgres los valida de inmediato mientras una planta se borra en cascada (APU y partidas caen a la vez) y
-- bloquea el borrado de la planta. Diferidos al final de la transacción: siguen impidiendo borrados sueltos y
-- permiten que la cascada completa de una planta termine.
ALTER TABLE "budget"."apu_resources" DROP CONSTRAINT "apu_resources_resource_id_resources_id_fk";--> statement-breakpoint
ALTER TABLE "budget"."apu_resources" ADD CONSTRAINT "apu_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "budget"."resources"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "budget"."items" DROP CONSTRAINT "items_apu_id_apus_id_fk";--> statement-breakpoint
ALTER TABLE "budget"."items" ADD CONSTRAINT "items_apu_id_apus_id_fk" FOREIGN KEY ("apu_id") REFERENCES "budget"."apus"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "budget"."budgets" DROP CONSTRAINT "budgets_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "budget"."budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "budget"."projects"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
