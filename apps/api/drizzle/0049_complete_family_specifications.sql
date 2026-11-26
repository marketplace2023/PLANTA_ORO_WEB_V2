-- Completa N4_10, N4_26 y N4_27 con 12 parámetros cada una.
-- Fuente SHA-256: 9d55804fcd83769e3a1939bbea16108a2eaaee1a30dc1a5c73ec51035c55e98b
-- Conserva ediciones administrativas, UUID, modelos y activos existentes.
WITH definitions(id, family_code, label, unit, value_type, required, sort_order) AS (VALUES
('838d958a-45ff-5e45-90eb-1752c97c4599','N4_10','Tipo de clarificador',NULL,'TEXT',true,1),
('422c1da3-3be9-549f-bddb-7aa51918dc2f','N4_10','Caudal de diseño','m³/h','TEXT',true,2),
('df04fb6c-a1e7-5878-92e6-4fbdf7ea9a76','N4_10','Área efectiva de sedimentación','m²','TEXT',true,3),
('3aa16851-2827-537e-81f0-62a362b57a2b','N4_10','Profundidad útil de agua','m','TEXT',true,4),
('6dadcaf6-25b5-55ae-8367-5bf7e6d6668e','N4_10','Material de las partes en contacto',NULL,'TEXT',true,5),
('1a2df330-2cd2-5a2b-811b-7e95faf1e25b','N4_10','Sistema de extracción de lodos',NULL,'TEXT',true,6),
('591d4f38-b6ba-5ce9-830e-4f9cf8b61668','N4_10','Diámetro del tanque','m','TEXT',false,7),
('2f07a3f4-2e3a-560b-a82b-7b7dbbf98f92','N4_10','Longitud del tanque','m','TEXT',false,8),
('45541fc4-dddf-529a-bcb7-fe4a6f39e9b9','N4_10','Ancho del tanque','m','TEXT',false,9),
('34a6b36c-9ea1-53cb-9757-155dc55b0f69','N4_10','Carga hidráulica superficial','m³/(m²·h)','TEXT',false,10),
('dd9233db-cd02-5149-9d3f-d58df354cca1','N4_10','Potencia instalada','kW','TEXT',false,11),
('10243f78-ef5b-5a2b-ab2a-60382f6dec03','N4_10','Par nominal del accionamiento','kN·m','TEXT',false,12),
('34836ca5-3513-5082-a388-6e2a7559bc18','N4_26','Tipo de estructura',NULL,'TEXT',true,1),
('067dc7a5-7c28-59f0-8e90-97d86db7f76b','N4_26','Material y grado estructural',NULL,'TEXT',true,2),
('02f9a860-e8bb-50ce-a6a3-49c28fa533d4','N4_26','Dimensiones generales','m','TEXT',true,3),
('ce3d50d0-e7f0-59db-94d0-974cd40433b5','N4_26','Sistema de unión principal',NULL,'TEXT',true,4),
('0b7ebbf8-f423-58dd-a682-28186e9c4296','N4_26','Condiciones de carga de diseño',NULL,'TEXT',true,5),
('c85515ec-9267-5bdf-905a-1d747b68ee2d','N4_26','Protección anticorrosiva',NULL,'TEXT',true,6),
('57d1478c-47f6-5ad0-b64c-5b4f76f36889','N4_26','Luz principal','m','TEXT',false,7),
('d7064d19-e452-5cea-84f1-bcf5ab4781f4','N4_26','Perfiles principales',NULL,'TEXT',false,8),
('e477f8ec-33d3-5e77-9aa8-41fe0159ee14','N4_26','Límite elástico del material','MPa','TEXT',false,9),
('580b1021-c451-5bd4-9052-4a76bba19173','N4_26','Masa del conjunto','kg','TEXT',false,10),
('3edabd1f-6290-5eef-b659-47fa3830b939','N4_26','Espesor de protección','µm','TEXT',false,11),
('1315d946-9a58-5c14-9a24-2067e0688ff4','N4_26','Norma de diseño declarada',NULL,'TEXT',false,12),
('64661ea2-810d-5c29-ba5b-bb10f84377e9','N4_27','Tipo de plataforma o pasarela',NULL,'TEXT',true,1),
('0f854243-1034-59fc-bb8b-133a5f334c77','N4_27','Material estructural principal',NULL,'TEXT',true,2),
('5f09eac4-2887-55b7-a73a-bb9d8bff2a24','N4_27','Longitud útil','m','TEXT',true,3),
('46cfbde2-6627-5da2-af52-fb8714c7dec4','N4_27','Ancho libre de paso','mm','TEXT',true,4),
('ff6beb0a-c60d-5dc9-87f4-5e009d6c428b','N4_27','Carga uniformemente distribuida admisible','kN/m²','TEXT',true,5),
('d2711f68-f2cc-508a-aa5c-831f4967c836','N4_27','Tipo de superficie antideslizante',NULL,'TEXT',true,6),
('8113e9d1-2abd-53f5-a5f0-cf84ef3530c7','N4_27','Altura de instalación','m','TEXT',false,7),
('b19b95c6-d4c9-52b0-83c0-ee0b05208dde','N4_27','Luz entre apoyos','m','TEXT',false,8),
('3c29fb21-2728-5c30-b60a-c2c55e6bcc3b','N4_27','Carga puntual admisible','kN','TEXT',false,9),
('1df83eb8-7400-5c12-9ef1-16ea5ed648e2','N4_27','Altura de barandilla','mm','TEXT',false,10),
('f00a0956-12b1-5aa9-b078-5b9593ccc5ac','N4_27','Altura de rodapié','mm','TEXT',false,11),
('e41f6a2d-2113-579f-816f-2782a7e3b73f','N4_27','Protección anticorrosiva',NULL,'TEXT',false,12)
)
INSERT INTO catalog.family_specifications (id,family_id,label,unit,value_type,required,sort_order)
SELECT v.id::uuid,f.id,v.label,v.unit,v.value_type,v.required,v.sort_order
FROM definitions v JOIN catalog.asset_families f ON f.code = v.family_code
WHERE NOT EXISTS (SELECT 1 FROM catalog.family_specifications s
  WHERE s.family_id = f.id AND lower(s.label) = lower(v.label));
