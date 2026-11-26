-- No se elige arbitrariamente entre varias referencias históricas.
UPDATE asset.assets a SET asset_model_id = r.model_id
FROM (SELECT asset_id,(array_agg(asset_model_id))[1] model_id FROM asset.catalog_references GROUP BY asset_id HAVING count(*)=1) r
WHERE a.id=r.asset_id AND a.asset_model_id IS NULL;
ALTER TABLE asset.assets ADD CONSTRAINT assets_origin_required CHECK (asset_model_id IS NOT NULL) NOT VALID;
CREATE TABLE asset.catalog_requests (
 id uuid PRIMARY KEY, plant_id uuid NOT NULL REFERENCES core.plants(id) ON DELETE CASCADE,
 submitted_by uuid NOT NULL REFERENCES iam.users(id), draft jsonb NOT NULL,
 status varchar(12) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 model_id uuid REFERENCES catalog.asset_models(id), asset_id uuid REFERENCES asset.assets(id),
 decision_note text, decided_by uuid REFERENCES iam.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
CREATE INDEX catalog_requests_plant_status ON asset.catalog_requests(plant_id,status);
