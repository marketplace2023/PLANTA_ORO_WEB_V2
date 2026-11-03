CREATE TABLE "asset"."tag_sequences" (
	"plant_id" uuid NOT NULL,
	"network_master_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "tag_sequences_plant_id_network_master_id_stage_master_id_family_id_pk" PRIMARY KEY("plant_id","network_master_id","stage_master_id","family_id")
);
--> statement-breakpoint
ALTER TABLE "catalog"."asset_families" ADD COLUMN "tag_code" varchar(12) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset"."tag_sequences" ADD CONSTRAINT "tag_sequences_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."tag_sequences" ADD CONSTRAINT "tag_sequences_network_master_id_network_master_id_fk" FOREIGN KEY ("network_master_id") REFERENCES "plant"."network_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."tag_sequences" ADD CONSTRAINT "tag_sequences_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."tag_sequences" ADD CONSTRAINT "tag_sequences_family_id_asset_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "catalog"."asset_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Todas las vías de alta (administración, Excel y seed) obtienen un código único.
CREATE FUNCTION catalog.assign_family_tag_code() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE
  base text;
  candidate text;
  suffix integer := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('catalog-family-tag-code'));
  IF TG_OP = 'UPDATE' AND OLD.tag_code <> '' AND NEW.tag_code IS DISTINCT FROM OLD.tag_code THEN
    RAISE EXCEPTION 'El código TAG de una familia es permanente' USING ERRCODE = '23514';
  END IF;
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
CREATE TRIGGER asset_families_assign_tag_code BEFORE INSERT OR UPDATE ON catalog.asset_families
FOR EACH ROW EXECUTE FUNCTION catalog.assign_family_tag_code();
--> statement-breakpoint
-- Abreviaturas revisadas de las familias actuales; conserva los códigos N4 y los IDs.
UPDATE catalog.asset_families SET tag_code = 'ACO' WHERE category_code = '66' OR code = 'N4_66';
UPDATE catalog.asset_families SET tag_code = 'AGI' WHERE category_code = '41' OR code = 'N4_41';
UPDATE catalog.asset_families SET tag_code = 'ALI' WHERE category_code = '04' OR code = 'N4_04';
UPDATE catalog.asset_families SET tag_code = 'ROM' WHERE category_code = '51' OR code = 'N4_51';
UPDATE catalog.asset_families SET tag_code = 'BTR' WHERE category_code = '05' OR code = 'N4_05';
UPDATE catalog.asset_families SET tag_code = 'BOM' WHERE category_code = '08' OR code = 'N4_08';
UPDATE catalog.asset_families SET tag_code = 'CAB' WHERE category_code = '62' OR code = 'N4_62';
UPDATE catalog.asset_families SET tag_code = 'CAL' WHERE category_code = '54' OR code = 'N4_54';
UPDATE catalog.asset_families SET tag_code = 'CAM' WHERE category_code = '30' OR code = 'N4_30';
UPDATE catalog.asset_families SET tag_code = 'CAN' WHERE category_code = '43' OR code = 'N4_43';
UPDATE catalog.asset_families SET tag_code = 'CAR' WHERE category_code = '61' OR code = 'N4_61';
UPDATE catalog.asset_families SET tag_code = 'CAT' WHERE category_code = '46' OR code = 'N4_46';
UPDATE catalog.asset_families SET tag_code = 'CEL' WHERE category_code = '13' OR code = 'N4_13';
UPDATE catalog.asset_families SET tag_code = 'COL' WHERE category_code = '40' OR code = 'N4_40';
UPDATE catalog.asset_families SET tag_code = 'COM' WHERE category_code = '16' OR code = 'N4_16';
UPDATE catalog.asset_families SET tag_code = 'CRI' WHERE category_code = '03' OR code = 'N4_03';
UPDATE catalog.asset_families SET tag_code = 'REL' WHERE category_code = '52' OR code = 'N4_52';
UPDATE catalog.asset_families SET tag_code = 'FIJ' WHERE category_code = '63' OR code = 'N4_63';
UPDATE catalog.asset_families SET tag_code = 'EPP' WHERE category_code = '67' OR code = 'N4_67';
UPDATE catalog.asset_families SET tag_code = 'CMC' WHERE category_code = '31' OR code = 'N4_31';
UPDATE catalog.asset_families SET tag_code = 'DOS' WHERE category_code = '34' OR code = 'N4_34';
UPDATE catalog.asset_families SET tag_code = 'LAB' WHERE category_code = '28' OR code = 'N4_28';
UPDATE catalog.asset_families SET tag_code = 'ESP' WHERE category_code = '11' OR code = 'N4_11';
UPDATE catalog.asset_families SET tag_code = 'EBO' WHERE category_code = '53' OR code = 'N4_53';
UPDATE catalog.asset_families SET tag_code = 'LAV' WHERE category_code = '47' OR code = 'N4_47';
UPDATE catalog.asset_families SET tag_code = 'FIL' WHERE category_code = '12' OR code = 'N4_12';
UPDATE catalog.asset_families SET tag_code = 'HID' WHERE category_code = '09' OR code = 'N4_09';
UPDATE catalog.asset_families SET tag_code = 'HOR' WHERE category_code = '14' OR code = 'N4_14';
UPDATE catalog.asset_families SET tag_code = 'INS' WHERE category_code = '23' OR code = 'N4_23';
UPDATE catalog.asset_families SET tag_code = 'INT' WHERE category_code = '15' OR code = 'N4_15';
UPDATE catalog.asset_families SET tag_code = 'KIT' WHERE category_code = '64' OR code = 'N4_64';
UPDATE catalog.asset_families SET tag_code = 'LUB' WHERE category_code = '60' OR code = 'N4_60';
UPDATE catalog.asset_families SET tag_code = 'MAL' WHERE category_code = '58' OR code = 'N4_58';
UPDATE catalog.asset_families SET tag_code = 'RAS' WHERE category_code = '42' OR code = 'N4_42';
UPDATE catalog.asset_families SET tag_code = 'MED' WHERE category_code = '57' OR code = 'N4_57';
UPDATE catalog.asset_families SET tag_code = 'MLD' WHERE category_code = '48' OR code = 'N4_48';
UPDATE catalog.asset_families SET tag_code = 'MOL' WHERE category_code = '01' OR code = 'N4_01';
UPDATE catalog.asset_families SET tag_code = 'MOT' WHERE category_code = '18' OR code = 'N4_18';
UPDATE catalog.asset_families SET tag_code = 'DET' WHERE category_code = '50' OR code = 'N4_50';
UPDATE catalog.asset_families SET tag_code = 'REA' WHERE category_code = '49' OR code = 'N4_49';
UPDATE catalog.asset_families SET tag_code = 'PLC' WHERE category_code = '32' OR code = 'N4_32';
UPDATE catalog.asset_families SET tag_code = 'REC' WHERE category_code = '45' OR code = 'N4_45';
UPDATE catalog.asset_families SET tag_code = 'RED' WHERE category_code = '19' OR code = 'N4_19';
UPDATE catalog.asset_families SET tag_code = 'REF' WHERE category_code = '65' OR code = 'N4_65';
UPDATE catalog.asset_families SET tag_code = 'REV' WHERE category_code = '56' OR code = 'N4_56';
UPDATE catalog.asset_families SET tag_code = 'ROD' WHERE category_code = '55' OR code = 'N4_55';
UPDATE catalog.asset_families SET tag_code = 'SEL' WHERE category_code = '59' OR code = 'N4_59';
UPDATE catalog.asset_families SET tag_code = 'SEP' WHERE category_code = '38' OR code = 'N4_38';
UPDATE catalog.asset_families SET tag_code = 'SER' WHERE category_code = '33' OR code = 'N4_33';
UPDATE catalog.asset_families SET tag_code = 'SIL' WHERE category_code = '06' OR code = 'N4_06';
UPDATE catalog.asset_families SET tag_code = 'POL' WHERE category_code = '39' OR code = 'N4_39';
UPDATE catalog.asset_families SET tag_code = 'SLU' WHERE category_code = '36' OR code = 'N4_36';
UPDATE catalog.asset_families SET tag_code = 'MUE' WHERE category_code = '35' OR code = 'N4_35';
UPDATE catalog.asset_families SET tag_code = 'SEG' WHERE category_code = '29' OR code = 'N4_29';
UPDATE catalog.asset_families SET tag_code = 'TNC' WHERE category_code = '44' OR code = 'N4_44';
UPDATE catalog.asset_families SET tag_code = 'SOP' WHERE category_code = '17' OR code = 'N4_17';
UPDATE catalog.asset_families SET tag_code = 'TAB' WHERE category_code = '22' OR code = 'N4_22';
UPDATE catalog.asset_families SET tag_code = 'TAN' WHERE category_code = '07' OR code = 'N4_07';
UPDATE catalog.asset_families SET tag_code = 'TRA' WHERE category_code = '21' OR code = 'N4_21';
UPDATE catalog.asset_families SET tag_code = 'TRI' WHERE category_code = '02' OR code = 'N4_02';
UPDATE catalog.asset_families SET tag_code = 'TUB' WHERE category_code = '25' OR code = 'N4_25';
UPDATE catalog.asset_families SET tag_code = 'UPH' WHERE category_code = '37' OR code = 'N4_37';
UPDATE catalog.asset_families SET tag_code = 'VAL' WHERE category_code = '24' OR code = 'N4_24';
UPDATE catalog.asset_families SET tag_code = 'VAR' WHERE category_code = '20' OR code = 'N4_20';
--> statement-breakpoint
-- Otras familias reciben una abreviatura disponible sin colisiones.
DO $body$ DECLARE family record; BEGIN
  FOR family IN SELECT id FROM catalog.asset_families WHERE tag_code = '' ORDER BY name, code LOOP
    UPDATE catalog.asset_families SET tag_code = '' WHERE id = family.id;
  END LOOP;
END; $body$;
--> statement-breakpoint
ALTER TABLE "catalog"."asset_families" ADD CONSTRAINT "asset_families_tag_code_unique" UNIQUE("tag_code");--> statement-breakpoint
ALTER TABLE "catalog"."asset_families" ADD CONSTRAINT "asset_families_tag_code_format" CHECK ("catalog"."asset_families"."tag_code" ~ '^[A-Z][A-Z0-9]{2,11}$');
