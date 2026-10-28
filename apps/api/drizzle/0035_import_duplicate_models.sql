ALTER TABLE "catalog"."asset_model_stage_keys" DROP CONSTRAINT "asset_model_stage_keys_identity_unique";--> statement-breakpoint
ALTER TABLE "catalog"."asset_model_stage_keys" ADD COLUMN "identity_scope" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" ADD COLUMN "duplicate_identity_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog"."asset_model_stage_keys" ADD CONSTRAINT "asset_model_stage_keys_identity_unique" UNIQUE("asset_type_id","manufacturer_id","model_name","stage_master_id","identity_scope") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" ADD CONSTRAINT "asset_models_duplicate_identity_requires_tag" CHECK (not "catalog"."asset_models"."duplicate_identity_allowed" or nullif(trim("catalog"."asset_models"."catalog_tag"), '') is not null);
--> statement-breakpoint
-- Las excepciones conservan nombre y TAG. Su ámbito único es el ID del modelo; las claves normales usan UUID cero.
-- Un cambio manual sin excepción no puede aprovechar un grupo que solo conserve modelos excepcionados.
CREATE OR REPLACE FUNCTION catalog.refresh_asset_model_stage_keys(p_model_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM catalog.asset_models m
    LEFT JOIN LATERAL (
      SELECT own.stage_master_id FROM catalog.asset_model_stages own WHERE own.asset_model_id = m.id
      UNION
      SELECT inherited.stage_master_id FROM catalog.asset_type_stages inherited
      WHERE inherited.asset_type_id = m.asset_type_id
        AND NOT EXISTS (SELECT 1 FROM catalog.asset_model_stages own WHERE own.asset_model_id = m.id)
    ) effective ON true
    JOIN catalog.asset_model_stage_keys other ON other.asset_model_id <> m.id
      AND other.asset_type_id = m.asset_type_id AND other.manufacturer_id = m.manufacturer_id
      AND other.model_name = m.model_name
      AND other.stage_master_id = COALESCE(effective.stage_master_id, '00000000-0000-0000-0000-000000000000'::uuid)
    WHERE m.id = p_model_id AND NOT m.duplicate_identity_allowed
      AND NOT EXISTS (
        SELECT 1 FROM catalog.asset_model_stage_keys previous
        WHERE previous.asset_model_id = m.id AND previous.asset_type_id = m.asset_type_id
          AND previous.manufacturer_id = m.manufacturer_id AND previous.model_name = m.model_name
          AND previous.stage_master_id = other.stage_master_id
          AND previous.identity_scope = '00000000-0000-0000-0000-000000000000'::uuid
      )
  ) THEN
    RAISE EXCEPTION 'Ya existe otro modelo con el mismo tipo, fabricante, nombre y etapa'
      USING ERRCODE = '23505', CONSTRAINT = 'asset_model_stage_keys_identity_unique';
  END IF;
  DELETE FROM catalog.asset_model_stage_keys WHERE asset_model_id = p_model_id;
  INSERT INTO catalog.asset_model_stage_keys
    (asset_model_id, asset_type_id, manufacturer_id, model_name, stage_master_id, identity_scope)
  SELECT m.id, m.asset_type_id, m.manufacturer_id, m.model_name,
    COALESCE(effective.stage_master_id, '00000000-0000-0000-0000-000000000000'::uuid),
    CASE WHEN m.duplicate_identity_allowed THEN m.id ELSE '00000000-0000-0000-0000-000000000000'::uuid END
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
CREATE OR REPLACE FUNCTION catalog.sync_asset_model_stage_keys() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected_models uuid[] := ARRAY[]::uuid[];
  affected_types uuid[] := ARRAY[]::uuid[];
  model_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'asset_models' THEN
    IF TG_OP = 'UPDATE' THEN
      IF ROW(NEW.asset_type_id, NEW.manufacturer_id, NEW.model_name, NEW.duplicate_identity_allowed)
        IS NOT DISTINCT FROM ROW(OLD.asset_type_id, OLD.manufacturer_id, OLD.model_name, OLD.duplicate_identity_allowed) THEN
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
