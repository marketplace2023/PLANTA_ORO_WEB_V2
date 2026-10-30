ALTER TABLE "catalog"."asset_models" DROP CONSTRAINT "asset_models_duplicate_identity_requires_tag";--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" DROP CONSTRAINT "asset_models_manufacturer_id_manufacturers_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" DROP COLUMN "manufacturer_id";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION catalog.reference_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT trim(regexp_replace(normalize(value, NFKC), '[[:space:]]+', ' ', 'g'));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION catalog.reference_identity(data jsonb) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT md5(coalesce(jsonb_agg(name ORDER BY name COLLATE "C"), '[]'::jsonb)::text)::uuid
  FROM (
    SELECT DISTINCT lower(catalog.reference_name(ref->>'nombre')) AS name
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'fabricantesReferencia') = 'array' THEN data->'fabricantesReferencia' ELSE '[]'::jsonb END) ref
    WHERE jsonb_typeof(ref->'nombre') = 'string' AND catalog.reference_name(ref->>'nombre') <> ''
  ) names;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION catalog.reference_manufacturer_id(value text) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (substr(hash,1,8) || '-' || substr(hash,9,4) || '-5' || substr(hash,14,3) || '-8' || substr(hash,18,3) || '-' || substr(hash,21,12))::uuid
  FROM (SELECT md5(lower(catalog.reference_name(value))) AS hash) digest;
$$;
--> statement-breakpoint
CREATE OR REPLACE VIEW catalog.model_reference_manufacturers AS
SELECT DISTINCT m.id AS asset_model_id,
  catalog.reference_manufacturer_id(ref->>'nombre') AS id,
  catalog.reference_name(ref->>'nombre') AS name
FROM catalog.asset_models m
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m.technical_data->'fabricantesReferencia') = 'array' THEN m.technical_data->'fabricantesReferencia' ELSE '[]'::jsonb END) ref
WHERE jsonb_typeof(ref->'nombre') = 'string' AND catalog.reference_name(ref->>'nombre') <> '';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION catalog.reference_manufacturer_names(data jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT string_agg(name, ', ' ORDER BY name COLLATE "C") FROM (
    SELECT min(catalog.reference_name(ref->>'nombre') COLLATE "C") AS name
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'fabricantesReferencia') = 'array' THEN data->'fabricantesReferencia' ELSE '[]'::jsonb END) ref
    WHERE jsonb_typeof(ref->'nombre') = 'string' AND catalog.reference_name(ref->>'nombre') <> ''
    GROUP BY lower(catalog.reference_name(ref->>'nombre'))
  ) names;
$$;

--> statement-breakpoint
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
      AND other.asset_type_id = m.asset_type_id AND other.manufacturer_id = catalog.reference_identity(m.technical_data)
      AND other.model_name = m.model_name
      AND other.stage_master_id = COALESCE(effective.stage_master_id, '00000000-0000-0000-0000-000000000000'::uuid)
    WHERE m.id = p_model_id AND NOT m.duplicate_identity_allowed
      AND NOT EXISTS (
        SELECT 1 FROM catalog.asset_model_stage_keys previous
        WHERE previous.asset_model_id = m.id AND previous.asset_type_id = m.asset_type_id
          AND previous.manufacturer_id = catalog.reference_identity(m.technical_data) AND previous.model_name = m.model_name
          AND previous.stage_master_id = other.stage_master_id
          AND previous.identity_scope = '00000000-0000-0000-0000-000000000000'::uuid
      )
  ) THEN
    RAISE EXCEPTION 'Ya existe otro modelo con el mismo tipo, fabricantes de referencia, nombre y etapa'
      USING ERRCODE = '23505', CONSTRAINT = 'asset_model_stage_keys_identity_unique';
  END IF;
  DELETE FROM catalog.asset_model_stage_keys WHERE asset_model_id = p_model_id;
  INSERT INTO catalog.asset_model_stage_keys
    (asset_model_id, asset_type_id, manufacturer_id, model_name, stage_master_id, identity_scope)
  SELECT m.id, m.asset_type_id, catalog.reference_identity(m.technical_data), m.model_name,
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
  WHERE m.id = p_model_id AND true;
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
      IF ROW(NEW.asset_type_id, catalog.reference_identity(NEW.technical_data), NEW.model_name, NEW.duplicate_identity_allowed)
        IS NOT DISTINCT FROM ROW(OLD.asset_type_id, catalog.reference_identity(OLD.technical_data), OLD.model_name, OLD.duplicate_identity_allowed) THEN
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

-- Se conservan todos los modelos anteriores. Las coincidencias que afloran al retirar
-- el fabricante viejo quedan como excepciones históricas, sin cambiar TAG ni fichas.
DELETE FROM catalog.asset_model_stage_keys;
--> statement-breakpoint
WITH keys AS (
  SELECT m.id, m.asset_type_id, catalog.reference_identity(m.technical_data) AS ref,
    m.model_name, coalesce(e.stage_master_id, '00000000-0000-0000-0000-000000000000'::uuid) AS stage
  FROM catalog.asset_models m
  LEFT JOIN LATERAL (
    SELECT stage_master_id FROM catalog.asset_model_stages WHERE asset_model_id = m.id
    UNION
    SELECT stage_master_id FROM catalog.asset_type_stages WHERE asset_type_id = m.asset_type_id
      AND NOT EXISTS (SELECT 1 FROM catalog.asset_model_stages WHERE asset_model_id = m.id)
  ) e ON true
), collisions AS (
  SELECT array_agg(id) AS ids FROM keys GROUP BY asset_type_id, ref, model_name, stage HAVING count(*) > 1
)
UPDATE catalog.asset_models SET duplicate_identity_allowed = true WHERE id IN (SELECT unnest(ids) FROM collisions);
--> statement-breakpoint
DO $$ DECLARE model_id uuid; BEGIN
  FOR model_id IN SELECT id FROM catalog.asset_models ORDER BY id LOOP
    PERFORM catalog.refresh_asset_model_stage_keys(model_id);
  END LOOP;
END $$;
