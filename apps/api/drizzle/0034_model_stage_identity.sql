CREATE TABLE "catalog"."asset_model_stage_keys" (
	"asset_model_id" uuid NOT NULL,
	"asset_type_id" uuid NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"model_name" varchar(200) NOT NULL,
	"stage_master_id" uuid NOT NULL,
	CONSTRAINT "asset_model_stage_keys_asset_model_id_stage_master_id_pk" PRIMARY KEY("asset_model_id","stage_master_id"),
	CONSTRAINT "asset_model_stage_keys_identity_unique" UNIQUE("asset_type_id","manufacturer_id","model_name","stage_master_id") DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" DROP CONSTRAINT "asset_models_asset_type_id_manufacturer_id_model_name_unique";--> statement-breakpoint
ALTER TABLE "catalog"."asset_model_stage_keys" ADD CONSTRAINT "asset_model_stage_keys_asset_model_id_asset_models_id_fk" FOREIGN KEY ("asset_model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- La etapa efectiva vive en relaciones: propia del modelo o heredada del tipo.
-- Este índice materializado permite que PostgreSQL garantice la unicidad incluso con escrituras concurrentes.
-- Sin fabricante se conserva el comportamiento anterior de UNIQUE (NULL no produce colisiones).
CREATE FUNCTION catalog.refresh_asset_model_stage_keys(p_model_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM catalog.asset_model_stage_keys WHERE asset_model_id = p_model_id;
  INSERT INTO catalog.asset_model_stage_keys
    (asset_model_id, asset_type_id, manufacturer_id, model_name, stage_master_id)
  SELECT m.id, m.asset_type_id, m.manufacturer_id, m.model_name,
    COALESCE(effective.stage_master_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FROM catalog.asset_models m
  LEFT JOIN LATERAL (
    SELECT own.stage_master_id FROM catalog.asset_model_stages own WHERE own.asset_model_id = m.id
    UNION
    SELECT inherited.stage_master_id FROM catalog.asset_type_stages inherited
    WHERE inherited.asset_type_id = m.asset_type_id
      AND NOT EXISTS (SELECT 1 FROM catalog.asset_model_stages own WHERE own.asset_model_id = m.id)
  ) effective ON true
  WHERE m.id = p_model_id AND m.manufacturer_id IS NOT NULL;
END;
$$;
--> statement-breakpoint
SELECT catalog.refresh_asset_model_stage_keys(id) FROM catalog.asset_models;
--> statement-breakpoint
CREATE FUNCTION catalog.sync_asset_model_stage_keys() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected_models uuid[] := ARRAY[]::uuid[];
  affected_types uuid[] := ARRAY[]::uuid[];
  model_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'asset_models' THEN
    IF TG_OP = 'UPDATE' THEN
      IF ROW(NEW.asset_type_id, NEW.manufacturer_id, NEW.model_name)
        IS NOT DISTINCT FROM ROW(OLD.asset_type_id, OLD.manufacturer_id, OLD.model_name) THEN
        RETURN NULL;
      END IF;
    END IF;
    affected_models := ARRAY[NEW.id];
  ELSIF TG_TABLE_NAME = 'asset_model_stages' THEN
    IF TG_OP <> 'INSERT' THEN affected_models := array_append(affected_models, OLD.asset_model_id); END IF;
    IF TG_OP <> 'DELETE' THEN affected_models := array_append(affected_models, NEW.asset_model_id); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN affected_types := array_append(affected_types, OLD.asset_type_id); END IF;
    IF TG_OP <> 'DELETE' THEN affected_types := array_append(affected_types, NEW.asset_type_id); END IF;
    SELECT array_agg(id ORDER BY id) INTO affected_models FROM catalog.asset_models
      WHERE asset_type_id = ANY(affected_types);
  END IF;
  FOR model_id IN SELECT DISTINCT unnest(affected_models) ORDER BY 1 LOOP
    PERFORM catalog.refresh_asset_model_stage_keys(model_id);
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Diferir hasta COMMIT evita conflictos transitorios al reemplazar vínculos o intercambiar etapas en una importación.
CREATE CONSTRAINT TRIGGER asset_models_stage_identity
AFTER INSERT OR UPDATE ON catalog.asset_models
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.sync_asset_model_stage_keys();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER asset_model_stages_identity
AFTER INSERT OR UPDATE OR DELETE ON catalog.asset_model_stages
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.sync_asset_model_stage_keys();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER asset_type_stages_identity
AFTER INSERT OR UPDATE OR DELETE ON catalog.asset_type_stages
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.sync_asset_model_stage_keys();
