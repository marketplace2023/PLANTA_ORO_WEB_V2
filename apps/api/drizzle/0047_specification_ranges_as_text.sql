-- Política vigente: las especificaciones de rango se registran como texto.
-- Capturar solo los parámetros convertidos, sin tocar variables ni otros tipos.
CREATE TEMP TABLE converted_specification_ranges ON COMMIT DROP AS
SELECT family_id, CASE WHEN coalesce(unit,'')='' THEN label ELSE label || ' (' || unit || ')' END AS key
FROM catalog.family_specifications WHERE value_type='RANGE';

CREATE FUNCTION pg_temp.specification_ranges_as_text(family uuid, input_values jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_object_agg(e.key,
    CASE WHEN jsonb_typeof(e.value) NOT IN ('string','null') AND EXISTS (
      SELECT 1 FROM converted_specification_ranges d WHERE d.family_id=family AND d.key=e.key
    ) THEN to_jsonb(CASE
      WHEN jsonb_typeof(e.value)='object' AND e.value - 'min' - 'max' = '{}'::jsonb
        AND (jsonb_typeof(e.value->'min')='number' OR NOT e.value ? 'min')
        AND (jsonb_typeof(e.value->'max')='number' OR NOT e.value ? 'max')
        AND (e.value ? 'min' OR e.value ? 'max')
      THEN CASE
        WHEN e.value ? 'min' AND e.value ? 'max' THEN (e.value->>'min') || '–' || (e.value->>'max')
        WHEN e.value ? 'min' THEN '≥ ' || (e.value->>'min')
        ELSE '≤ ' || (e.value->>'max') END
      ELSE e.value::text END)
    ELSE e.value END), '{}'::jsonb)
  FROM jsonb_each(input_values) e
$$;

UPDATE catalog.asset_models m
SET specifications=pg_temp.specification_ranges_as_text(t.family_id,m.specifications)
FROM catalog.asset_types t
WHERE m.asset_type_id=t.id AND m.specifications IS DISTINCT FROM pg_temp.specification_ranges_as_text(t.family_id,m.specifications);

UPDATE asset.assets a
SET specifications=pg_temp.specification_ranges_as_text(f.family_id,a.specifications)
FROM (SELECT a.id,coalesce(a.family_id,t.family_id) family_id FROM asset.assets a
  LEFT JOIN catalog.asset_models m ON m.id=a.asset_model_id
  LEFT JOIN catalog.asset_types t ON t.id=m.asset_type_id) f
WHERE a.id=f.id AND a.specifications IS DISTINCT FROM pg_temp.specification_ranges_as_text(f.family_id,a.specifications);

UPDATE catalog.asset_types t
SET default_specs=pg_temp.specification_ranges_as_text(t.family_id,t.default_specs)
WHERE t.default_specs IS DISTINCT FROM pg_temp.specification_ranges_as_text(t.family_id,t.default_specs);

UPDATE asset.catalog_requests r
SET draft=jsonb_set(r.draft,'{specifications}',pg_temp.specification_ranges_as_text((r.draft->>'familyId')::uuid,r.draft->'specifications'))
WHERE r.status='PENDING' AND jsonb_typeof(r.draft->'specifications')='object'
  AND r.draft->'specifications' IS DISTINCT FROM pg_temp.specification_ranges_as_text((r.draft->>'familyId')::uuid,r.draft->'specifications');

UPDATE catalog.family_specifications SET value_type='TEXT' WHERE value_type='RANGE';
DROP FUNCTION pg_temp.specification_ranges_as_text(uuid,jsonb);
DROP TABLE converted_specification_ranges;
