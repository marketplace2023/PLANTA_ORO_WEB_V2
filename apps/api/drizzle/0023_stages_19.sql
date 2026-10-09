-- Las etapas del proceso pasan de 20 (D01–D20) a las 19 oficiales (D01–D19), con nombres nuevos.
-- Solo actúa sobre una base con el esquema anterior (la que tiene D20); en una base nueva o ya migrada no hace nada.
--
-- Qué pasa con cada etapa anterior:
--   * Se fusionan en otra (sus activos, cursos, productos, servicios y documentos se pasan a la que las absorbe):
--       D03 Cribado Primario            → D01 Recepción, chancado y cribado
--       D13 Lavado Ácido de Carbón      → D13 Zadra / elución (antes D14)
--       D17 Fundición y Producto Doré   → D16 Secado y fundición
--       D20 Disposición de Relaves      → D19 Relaves y agua / manejo ambiental
--   * Cambian de código y conservan su registro (todo lo que apunta a ellas las sigue a ellas):
--       D04→D03, D05→D04, D06→D05, D07→D06, D08→D07, D09→D08, D10→D09, D11→D10, D14→D13, D18→D17
--   * Siguen con el mismo código: D01, D02, D12, D15, D16, D19
--   * Nuevas: D11 Tanques CIP, D14 Filtración del eluato, D18 Manejo de soluciones
-- Las plantas que ya tenían etapas habilitadas conservan las que tenían; las tres nuevas se habilitan desde Administrar.
DO $$
DECLARE
  m record;
  p record;
  src uuid;
  dst uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM process.stage_master WHERE code = 'D20') THEN
    RETURN;
  END IF;

  -- Secuencia por defecto anterior, para ajustar solo las etapas de planta que no tenían un orden propio.
  CREATE TEMP TABLE _old_stage_seq ON COMMIT DROP AS SELECT id, sequence_default FROM process.stage_master;

  -- 1) Fusiones.
  FOR m IN SELECT * FROM (VALUES ('D03', 'D01'), ('D13', 'D14'), ('D17', 'D16'), ('D20', 'D19')) AS t(old_code, into_code) LOOP
    SELECT id INTO src FROM process.stage_master WHERE code = m.old_code;
    SELECT id INTO dst FROM process.stage_master WHERE code = m.into_code;

    -- Vínculos con la etapa maestra: se copian a la que absorbe (los repetidos se ignoran).
    INSERT INTO catalog.asset_type_stages (asset_type_id, stage_master_id) SELECT asset_type_id, dst FROM catalog.asset_type_stages WHERE stage_master_id = src ON CONFLICT DO NOTHING;
    INSERT INTO lms.course_stages (course_id, stage_master_id) SELECT course_id, dst FROM lms.course_stages WHERE stage_master_id = src ON CONFLICT DO NOTHING;
    INSERT INTO marketplace.listing_stages (listing_id, stage_master_id) SELECT listing_id, dst FROM marketplace.listing_stages WHERE stage_master_id = src ON CONFLICT DO NOTHING;
    INSERT INTO professional.service_stages (service_id, stage_master_id) SELECT service_id, dst FROM professional.service_stages WHERE stage_master_id = src ON CONFLICT DO NOTHING;
    INSERT INTO provider.provider_stage_capabilities (provider_id, stage_master_id) SELECT provider_id, dst FROM provider.provider_stage_capabilities WHERE stage_master_id = src ON CONFLICT DO NOTHING;

    -- Etapas de cada planta.
    FOR p IN
      SELECT ps.id AS src_ps, (SELECT t.id FROM process.plant_stages t WHERE t.plant_id = ps.plant_id AND t.stage_master_id = dst) AS dst_ps
      FROM process.plant_stages ps WHERE ps.stage_master_id = src
    LOOP
      IF p.dst_ps IS NULL THEN
        -- La planta no tenía la etapa que absorbe: su etapa pasa a ser esa (conserva activos, documentos y flujos).
        UPDATE process.plant_stages SET stage_master_id = dst WHERE id = p.src_ps;
      ELSE
        UPDATE asset.assets SET plant_stage_id = p.dst_ps WHERE plant_stage_id = p.src_ps;
        UPDATE procurement.requisitions SET stage_id = p.dst_ps WHERE stage_id = p.src_ps;

        DELETE FROM document.stage_documents d WHERE d.plant_stage_id = p.src_ps
          AND EXISTS (SELECT 1 FROM document.stage_documents d2 WHERE d2.document_id = d.document_id AND d2.plant_stage_id = p.dst_ps);
        UPDATE document.stage_documents SET plant_stage_id = p.dst_ps WHERE plant_stage_id = p.src_ps;

        -- Flujos: se quitan los que quedarían de la etapa consigo misma y los que quedarían repetidos.
        DELETE FROM process.stage_connections
          WHERE (source_stage_id = p.src_ps AND target_stage_id = p.dst_ps) OR (source_stage_id = p.dst_ps AND target_stage_id = p.src_ps);
        DELETE FROM process.stage_connections c WHERE c.source_stage_id = p.src_ps
          AND EXISTS (SELECT 1 FROM process.stage_connections c2 WHERE c2.source_stage_id = p.dst_ps AND c2.target_stage_id = c.target_stage_id AND c2.flow_type = c.flow_type);
        UPDATE process.stage_connections SET source_stage_id = p.dst_ps WHERE source_stage_id = p.src_ps;
        DELETE FROM process.stage_connections c WHERE c.target_stage_id = p.src_ps
          AND EXISTS (SELECT 1 FROM process.stage_connections c2 WHERE c2.target_stage_id = p.dst_ps AND c2.source_stage_id = c.source_stage_id AND c2.flow_type = c.flow_type);
        UPDATE process.stage_connections SET target_stage_id = p.dst_ps WHERE target_stage_id = p.src_ps;

        DELETE FROM process.plant_stages WHERE id = p.src_ps;
      END IF;
    END LOOP;

    DELETE FROM process.stage_master WHERE id = src;
  END LOOP;

  -- 2) Cambios de código: pasan por un código temporal para no chocar con la restricción de unicidad.
  UPDATE process.stage_master sm SET code = 'T' || v.new_code
    FROM (VALUES ('D04', 'D03'), ('D05', 'D04'), ('D06', 'D05'), ('D07', 'D06'), ('D08', 'D07'), ('D09', 'D08'), ('D10', 'D09'), ('D11', 'D10'), ('D14', 'D13'), ('D18', 'D17')) AS v(old_code, new_code)
    WHERE sm.code = v.old_code;
  UPDATE process.stage_master SET code = substr(code, 2) WHERE code LIKE 'T%';

  -- 3) Nombres, grupos, colores y orden de las 19 (las tres nuevas se crean).
  INSERT INTO process.stage_master (id, code, name, stage_group, color_token, sequence_default) VALUES
    (gen_random_uuid(), 'D01', 'Recepción, chancado y cribado', 'TRITURACION', 'orange', 1),
    (gen_random_uuid(), 'D02', 'Trituración primaria', 'TRITURACION', 'orange', 2),
    (gen_random_uuid(), 'D03', 'Trituración secundaria', 'TRITURACION', 'orange', 3),
    (gen_random_uuid(), 'D04', 'Almacenamiento (silos)', 'TRITURACION', 'orange', 4),
    (gen_random_uuid(), 'D05', 'Molienda primaria', 'MOLIENDA', 'blue', 5),
    (gen_random_uuid(), 'D06', 'Molienda secundaria', 'MOLIENDA', 'blue', 6),
    (gen_random_uuid(), 'D07', 'Clasificación (hidrociclones)', 'MOLIENDA', 'blue', 7),
    (gen_random_uuid(), 'D08', 'Pre-lixiviación', 'LIXIVIACION', 'green', 8),
    (gen_random_uuid(), 'D09', 'Espesamiento (clarificador)', 'LIXIVIACION', 'green', 9),
    (gen_random_uuid(), 'D10', 'Tanques CIL (adsorción)', 'LIXIVIACION', 'green', 10),
    (gen_random_uuid(), 'D11', 'Tanques CIP (recuperación)', 'LIXIVIACION', 'green', 11),
    (gen_random_uuid(), 'D12', 'Carbón cargado', 'CARBON', 'purple', 12),
    (gen_random_uuid(), 'D13', 'Zadra / elución a presión controlada', 'ELUCION', 'yellow', 13),
    (gen_random_uuid(), 'D14', 'Filtración del eluato', 'ELUCION', 'yellow', 14),
    (gen_random_uuid(), 'D15', 'Electrodeposición (EW)', 'ELUCION', 'yellow', 15),
    (gen_random_uuid(), 'D16', 'Secado y fundición', 'ELUCION', 'yellow', 16),
    (gen_random_uuid(), 'D17', 'Regeneración de carbón', 'CARBON', 'purple', 17),
    (gen_random_uuid(), 'D18', 'Manejo de soluciones', 'RELAVES', 'cyan', 18),
    (gen_random_uuid(), 'D19', 'Relaves y agua / manejo ambiental', 'RELAVES', 'cyan', 19)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, stage_group = EXCLUDED.stage_group, color_token = EXCLUDED.color_token, sequence_default = EXCLUDED.sequence_default;

  -- 4) Los tipos de activo que se usaban en todas las etapas (tableros, transformadores…) pasan a usarse también en las tres nuevas.
  INSERT INTO catalog.asset_type_stages (asset_type_id, stage_master_id)
    SELECT t.asset_type_id, n.id
    FROM (SELECT asset_type_id FROM catalog.asset_type_stages GROUP BY asset_type_id HAVING count(*) = 16) t
    CROSS JOIN process.stage_master n WHERE n.code IN ('D11', 'D14', 'D18')
  ON CONFLICT DO NOTHING;

  -- 5) El orden de las etapas de cada planta sigue al nuevo orden, salvo las que tenían uno propio.
  UPDATE process.plant_stages ps SET sequence = sm.sequence_default
    FROM process.stage_master sm, _old_stage_seq o
    WHERE ps.stage_master_id = sm.id AND o.id = sm.id AND ps.sequence = o.sequence_default;
END $$;
