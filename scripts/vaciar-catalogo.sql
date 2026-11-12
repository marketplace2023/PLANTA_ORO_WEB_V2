-- Vacía el catálogo y los datos operativos que dependen de él, para empezar de cero con la carga masiva (Excel).
-- CONSERVA: usuarios, roles y permisos, plantas y su configuración, etapas (maestro y por planta, con sus imágenes y
-- conexiones), redes (maestro y por planta), organizaciones, cursos, documentos no vinculados a activos, presupuestos y
-- auditoría.
-- BORRA: familias, tipos, fabricantes, modelos (con sus etapas y valores), variables y, por depender de ellos: activos
-- (con redes, historial, vínculos a documentos, planes y órdenes de mantenimiento), ítems de inventario de un modelo
-- (con existencias y movimientos) y publicaciones del marketplace. Las referencias opcionales se desvinculan (null).
-- Reinicia el correlativo FUR de cada planta (el próximo activo vuelve a ser …-00001).
-- Las fotos de los modelos (almacenamiento: catalog/models/…) se borran aparte. Todo o nada: una transacción.
begin;

-- Referencias opcionales hacia lo que se va a borrar: se desvinculan.
update procurement.requisitions set asset_id = null where asset_id is not null;
update procurement.requisitions set work_order_id = null where work_order_id is not null;
update procurement.requisition_lines set item_id = null where item_id in (select id from inventory.items where catalog_item_id is not null);
update budget.resources set source_item_id = null where source_item_id in (select id from inventory.items where catalog_item_id is not null);

-- Datos operativos que dependen del catálogo (sus tablas hijas caen en cascada).
delete from asset.assets;
delete from inventory.items where catalog_item_id is not null;
delete from marketplace.listings;

-- Catálogo (vínculos de etapas, redes, tipos y valores caen en cascada).
delete from catalog.variable_definitions;
delete from catalog.asset_models;
delete from catalog.asset_types;
delete from catalog.asset_families;
delete from catalog.manufacturers;

-- Sin activos, el correlativo FUR vuelve a empezar.
update core.plant_settings set asset_seq = 0;

select
  (select count(*)::int from catalog.asset_families) as familias,
  (select count(*)::int from catalog.asset_types) as tipos,
  (select count(*)::int from catalog.asset_models) as modelos,
  (select count(*)::int from catalog.manufacturers) as fabricantes,
  (select count(*)::int from catalog.variable_definitions) as variables,
  (select count(*)::int from asset.assets) as activos,
  (select count(*)::int from inventory.items where catalog_item_id is not null) as inventario_de_modelos,
  (select count(*)::int from marketplace.listings) as publicaciones,
  (select count(*)::int from iam.users) as usuarios,
  (select count(*)::int from core.plants) as plantas,
  (select count(*)::int from iam.roles) as roles,
  (select count(*)::int from process.stage_master) as etapas,
  (select count(*)::int from process.plant_stages) as etapas_por_planta,
  (select count(*)::int from plant.network_master) as redes,
  (select count(*)::int from plant.plant_networks) as redes_por_planta;

commit;
