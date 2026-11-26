CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "catalog"."model_search_documents" (
	"model_id" uuid PRIMARY KEY NOT NULL,
	"identity" text NOT NULL,
	"document" text NOT NULL,
	"search_vector" "tsvector" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."model_search_quantities" (
	"model_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"amount" numeric NOT NULL,
	CONSTRAINT "model_search_quantities_model_id_unit_amount_pk" PRIMARY KEY("model_id","unit","amount")
);
--> statement-breakpoint
ALTER TABLE "catalog"."model_search_documents" ADD CONSTRAINT "model_search_documents_model_id_asset_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."model_search_quantities" ADD CONSTRAINT "model_search_quantities_model_id_asset_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_search_document_trgm_idx" ON "catalog"."model_search_documents" USING gin ("document" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "model_search_vector_idx" ON "catalog"."model_search_documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "model_search_quantity_idx" ON "catalog"."model_search_quantities" USING btree ("unit","amount","model_id");
--> statement-breakpoint
CREATE FUNCTION catalog.search_normalize(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(regexp_replace(normalize(coalesce(value, ''), NFD), U&'[\0300-\036f]', '', 'g'));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION catalog.refresh_model_search(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ident text; refs text; specs_text text; spec record; content text; unit_key text; match text[];
BEGIN
  SELECT catalog.search_normalize(concat_ws(' ', m.model_name, m.catalog_tag, t.name, f.name)),
    catalog.search_normalize(catalog.reference_manufacturer_names(m.technical_data))
  INTO ident, refs FROM catalog.asset_models m
    JOIN catalog.asset_types t ON t.id=m.asset_type_id
    JOIN catalog.asset_families f ON f.id=t.family_id WHERE m.id=p_id;
  IF NOT FOUND THEN RETURN; END IF;
  specs_text := '';
  DELETE FROM catalog.model_search_quantities WHERE model_id=p_id;
  -- Los parámetros y sus valores siguen conservándose exclusivamente en la ficha original.
  FOR spec IN SELECT s.key, s.value FROM catalog.asset_models m,
    LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(m.specifications)='object' THEN m.specifications ELSE '{}'::jsonb END) s
    WHERE m.id=p_id AND nullif(trim(s.value),'') IS NOT NULL
      AND catalog.search_normalize(regexp_replace(trim(s.value),'\s+',' ','g')) <> 'no aplica'
    ORDER BY s.key
  LOOP
    specs_text := specs_text || ' ' || spec.key || ' ' || spec.value;
    content := translate(catalog.search_normalize(spec.value),'²³µμ','23uu');
    unit_key := translate(regexp_replace(substring(catalog.search_normalize(spec.key) from '\(([^()]*)\)\s*$'),'\s+','','g'),'²³µμ','23uu');
    IF nullif(unit_key,'') IS NOT NULL THEN
      FOR match IN SELECT regexp_matches(content, '(?<![a-z0-9.,+-])(-?[0-9]+(?:[.,][0-9]+)?)(?![0-9.,])','g') LOOP
        INSERT INTO catalog.model_search_quantities(model_id,unit,amount)
          VALUES(p_id,unit_key,replace(match[1],',','.')::numeric) ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
    FOR match IN SELECT regexp_matches(content, '(?<![a-z0-9.,+-])(-?[0-9]+(?:[.,][0-9]+)?)\s*([a-z°%][a-z0-9°%/^·*-]*)','g') LOOP
      INSERT INTO catalog.model_search_quantities(model_id,unit,amount)
        VALUES(p_id,match[2],replace(match[1],',','.')::numeric) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  content := translate(ident,'²³µμ','23uu');
  FOR match IN SELECT regexp_matches(content, '(?<![a-z0-9.,+-])(-?[0-9]+(?:[.,][0-9]+)?)\s*([a-z°%][a-z0-9°%/^·*-]*)','g') LOOP
    INSERT INTO catalog.model_search_quantities(model_id,unit,amount)
      VALUES(p_id,match[2],replace(match[1],',','.')::numeric) ON CONFLICT DO NOTHING;
  END LOOP;
  specs_text := catalog.search_normalize(ltrim(specs_text));
  INSERT INTO catalog.model_search_documents(model_id,identity,document,search_vector)
    VALUES(p_id,ident,concat_ws(' ',ident,refs,specs_text),
      setweight(to_tsvector('spanish',ident),'A') || setweight(to_tsvector('spanish',refs),'B') || setweight(to_tsvector('spanish',specs_text),'C'))
    ON CONFLICT(model_id) DO UPDATE SET identity=excluded.identity,document=excluded.document,search_vector=excluded.search_vector;
END $$;
--> statement-breakpoint
CREATE FUNCTION catalog.model_search_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM catalog.refresh_model_search(NEW.id); RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER model_search_changed AFTER INSERT OR UPDATE OF model_name,catalog_tag,asset_type_id,specifications,technical_data
  ON catalog.asset_models FOR EACH ROW EXECUTE FUNCTION catalog.model_search_changed();
--> statement-breakpoint
CREATE FUNCTION catalog.model_search_type_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM catalog.refresh_model_search(id) FROM catalog.asset_models WHERE asset_type_id=NEW.id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER model_search_type_changed AFTER UPDATE OF name,family_id ON catalog.asset_types
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.family_id IS DISTINCT FROM NEW.family_id)
  EXECUTE FUNCTION catalog.model_search_type_changed();
--> statement-breakpoint
CREATE FUNCTION catalog.model_search_family_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM catalog.refresh_model_search(m.id) FROM catalog.asset_models m JOIN catalog.asset_types t ON t.id=m.asset_type_id WHERE t.family_id=NEW.id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER model_search_family_changed AFTER UPDATE OF name ON catalog.asset_families
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION catalog.model_search_family_changed();
--> statement-breakpoint
SELECT catalog.refresh_model_search(id) FROM catalog.asset_models;
--> statement-breakpoint
-- Serializa las escrituras del maestro antes de tomar bloqueos de filas. Evita que
-- una edición concurrente de familia/tipo sobrescriba la proyección de otra ficha.
CREATE FUNCTION catalog.lock_search_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_advisory_xact_lock(hashtext('catalog.search_projection')); RETURN NULL; END $$;
--> statement-breakpoint
CREATE TRIGGER lock_search_projection BEFORE INSERT OR UPDATE OR DELETE ON catalog.asset_models
  FOR EACH STATEMENT EXECUTE FUNCTION catalog.lock_search_projection();
--> statement-breakpoint
CREATE TRIGGER lock_search_projection BEFORE INSERT OR UPDATE OR DELETE ON catalog.asset_types
  FOR EACH STATEMENT EXECUTE FUNCTION catalog.lock_search_projection();
--> statement-breakpoint
CREATE TRIGGER lock_search_projection BEFORE INSERT OR UPDATE OR DELETE ON catalog.asset_families
  FOR EACH STATEMENT EXECUTE FUNCTION catalog.lock_search_projection();
--> statement-breakpoint
ANALYZE catalog.model_search_documents;
--> statement-breakpoint
ANALYZE catalog.model_search_quantities;
