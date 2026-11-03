-- Los cambios de código afectan solo a futuras altas; los TAG existentes son permanentes.
CREATE OR REPLACE FUNCTION catalog.assign_family_tag_code() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE
  base text;
  candidate text;
  suffix integer := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('catalog-family-tag-code'));
  IF NEW.tag_code IS NULL OR NEW.tag_code = '' THEN
    base := upper(regexp_replace(translate(NEW.name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^a-zA-Z0-9]', '', 'g'));
    base := substr(base, 1, 3);
    IF base !~ '^[A-Z]' OR length(base) < 3 THEN base := 'FAM'; END IF;
    candidate := base;
    WHILE candidate IN ('ACO','AGI','ALI','ROM','BTR','BOM','CAB','CAL','CAM','CAN','CAR','CAT','CEL','COL','COM','CRI','REL','FIJ','EPP','CMC','DOS','LAB','ESP','EBO','LAV','FIL','HID','HOR','INS','INT','KIT','LUB','MAL','RAS','MED','MLD','MOL','MOT','DET','REA','PLC','REC','RED','REF','REV','ROD','SEL','SEP','SER','SIL','POL','SLU','MUE','SEG','TNC','SOP','TAB','TAN','TRA','TRI','TUB','UPH','VAL','VAR') OR EXISTS (SELECT 1 FROM catalog.asset_families f WHERE f.tag_code = candidate AND f.id <> NEW.id) LOOP
      suffix := suffix + 1;
      candidate := base || suffix::text;
    END LOOP;
    NEW.tag_code := candidate;
  END IF;
  RETURN NEW;
END;
$body$;
--> statement-breakpoint
