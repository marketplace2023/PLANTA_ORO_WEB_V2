import { Pool } from 'pg'

/**
 * Capa de vistas con nombres de tablas de Odoo (esquema `odoo`). Es solo una **presentación**: no mueve ni copia datos
 * y la API sigue usando las tablas reales. Cada vista es un `select` directo de la tabla real, así que cambia al
 * instante con ella (y, al ser simples, también aceptan insert/update/delete). No es Odoo ni está conectada a Odoo.
 *
 * Convención: si Odoo tiene una tabla equivalente se usa su nombre; si no, el nombre lleva el prefijo `x_`, que es como
 * Odoo nombra los modelos personalizados. Algunas vistas añaden columnas con nombre de Odoo (`default_code`, `login`…)
 * además de las originales.
 */
export type Entry = {
  /** Nombre de la vista (tabla de Odoo equivalente). */
  odoo: string
  /** Tabla real: `esquema.tabla`. */
  real: string
  /** Columnas extra con nombre de Odoo, como expresión SQL sobre `t` (la tabla real). */
  extra?: string
}

export const MAP: Entry[] = [
  // Productos: el catálogo y los activos físicos
  { odoo: 'product_category', real: 'catalog.asset_families', extra: `t.name as complete_name` },
  { odoo: 'x_product_type', real: 'catalog.asset_types', extra: `t.family_id as categ_id` },
  { odoo: 'product_template', real: 'catalog.asset_models', extra: `t.model_name as name, (t.status = 'ACTIVE') as active, t.asset_type_id as categ_id` },
  { odoo: 'product_product', real: 'asset.assets', extra: `t.tag as default_code, t.fur_code as barcode, t.asset_model_id as product_tmpl_id, t.plant_id as company_id, (t.status <> 'DECOMMISSIONED') as active` },
  { odoo: 'x_product_manufacturer', real: 'catalog.manufacturers' },
  { odoo: 'x_product_type_stage', real: 'catalog.asset_type_stages' },
  { odoo: 'x_product_type_network', real: 'catalog.asset_type_networks' },
  { odoo: 'x_product_network_rel', real: 'asset.asset_networks' },
  { odoo: 'mail_tracking_value', real: 'asset.asset_status_history' },
  { odoo: 'product_supplierinfo', real: 'marketplace.listings' },
  { odoo: 'x_product_supplierinfo_stage', real: 'marketplace.listing_stages' },
  { odoo: 'product_price_history', real: 'budget.price_history' },

  // Empresas, usuarios y permisos
  { odoo: 'res_company', real: 'core.plants' },
  { odoo: 'x_ecosystem', real: 'core.ecosystems' },
  { odoo: 'res_config_settings', real: 'core.plant_settings' },
  { odoo: 'ir_sequence', real: 'core.code_sequences' },
  { odoo: 'res_users', real: 'iam.users', extra: `t.email as login, (t.first_name || ' ' || t.last_name) as name, (t.status = 'ACTIVE') as active` },
  { odoo: 'res_groups', real: 'iam.roles' },
  { odoo: 'ir_model_access', real: 'iam.permissions' },
  { odoo: 'x_ir_model_access_group_rel', real: 'iam.role_permissions' },
  { odoo: 'res_groups_users_rel', real: 'iam.user_plant_roles' },
  { odoo: 'ir_rule', real: 'iam.user_plant_overrides' },
  { odoo: 'res_users_apikeys', real: 'iam.refresh_tokens' },
  { odoo: 'x_res_users_access_request', real: 'iam.plant_access_requests' },
  { odoo: 'auditlog_log', real: 'audit.events' },

  // Proveedores y contratistas
  { odoo: 'res_partner', real: 'provider.providers', extra: `t.organization_name as name, t.tax_id as vat, t.contact_email as email, (t.status = 'ACTIVE') as active, 1 as supplier_rank` },
  { odoo: 'x_res_partner_member', real: 'provider.provider_members' },
  { odoo: 'res_partner_res_partner_category_rel', real: 'provider.provider_asset_families' },
  { odoo: 'x_res_partner_stage', real: 'provider.provider_stage_capabilities' },
  { odoo: 'x_res_partner_contractor', real: 'professional.contractors', extra: `t.organization_name as name, t.tax_id as vat, t.contact_email as email, (t.status = 'ACTIVE') as active` },
  { odoo: 'x_res_partner_contractor_member', real: 'professional.contractor_members' },
  { odoo: 'x_professional_service', real: 'professional.services' },
  { odoo: 'x_professional_service_stage', real: 'professional.service_stages' },

  // Inventario
  { odoo: 'stock_warehouse', real: 'inventory.warehouses', extra: `t.plant_id as company_id` },
  { odoo: 'stock_location', real: 'inventory.locations' },
  { odoo: 'stock_quant', real: 'inventory.stock' },
  { odoo: 'stock_move', real: 'inventory.movements' },
  { odoo: 'x_stock_item', real: 'inventory.items', extra: `t.sku as default_code` },

  // Mantenimiento
  { odoo: 'maintenance_request', real: 'maintenance.work_orders', extra: `t.title as name, t.asset_id as equipment_id, t.created_at as request_date` },
  { odoo: 'maintenance_plan', real: 'maintenance.plans' },
  { odoo: 'x_maintenance_request_cost', real: 'maintenance.work_order_costs' },
  { odoo: 'x_maintenance_request_history', real: 'maintenance.work_order_history' },
  { odoo: 'x_maintenance_request_part', real: 'maintenance.work_order_parts' },

  // Compras
  { odoo: 'purchase_requisition', real: 'procurement.requisitions', extra: `t.code as name` },
  { odoo: 'purchase_requisition_line', real: 'procurement.requisition_lines' },
  { odoo: 'x_purchase_requisition_history', real: 'procurement.requisition_history' },
  { odoo: 'purchase_order', real: 'procurement.rfqs' },
  { odoo: 'x_purchase_order_invitation', real: 'procurement.rfq_invitations' },
  { odoo: 'purchase_order_line', real: 'procurement.supplier_quotes' },

  // Procesos de planta
  { odoo: 'mrp_workcenter', real: 'process.stage_master' },
  { odoo: 'mrp_routing_workcenter', real: 'process.plant_stages' },
  { odoo: 'x_mrp_routing_flow', real: 'process.stage_connections' },
  { odoo: 'x_network', real: 'plant.network_master' },
  { odoo: 'x_company_network', real: 'plant.plant_networks' },

  // Presupuestos y valorizaciones
  { odoo: 'project_project', real: 'budget.projects' },
  { odoo: 'crossovered_budget', real: 'budget.budgets' },
  { odoo: 'account_budget_post', real: 'budget.chapters' },
  { odoo: 'crossovered_budget_lines', real: 'budget.items' },
  { odoo: 'mrp_bom', real: 'budget.apus' },
  { odoo: 'mrp_bom_line', real: 'budget.apu_resources' },
  { odoo: 'x_budget_resource', real: 'budget.resources' },
  { odoo: 'res_currency_rate', real: 'budget.exchange_rates' },
  { odoo: 'x_budget_scenario', real: 'budget.scenarios' },
  { odoo: 'account_move', real: 'budget.valuations' },
  { odoo: 'account_move_line', real: 'budget.valuation_lines' },

  // Documentos
  { odoo: 'documents_document', real: 'document.documents' },
  { odoo: 'ir_attachment', real: 'document.document_versions' },
  { odoo: 'x_product_document', real: 'document.asset_documents' },
  { odoo: 'x_stage_document', real: 'document.stage_documents' },

  // Capacitación (eLearning)
  { odoo: 'slide_channel', real: 'lms.courses', extra: `t.title as name, (t.status = 'PUBLISHED') as website_published` },
  { odoo: 'slide_slide', real: 'lms.lessons' },
  { odoo: 'slide_channel_partner', real: 'lms.enrollments' },
  { odoo: 'slide_slide_partner', real: 'lms.lesson_progress' },
  { odoo: 'x_slide_channel_stage', real: 'lms.course_stages' },
]

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`
const qualified = (real: string) => real.split('.').map(ident).join('.')

/** Crea (o recrea) el esquema `odoo` con una vista por tabla. Idempotente. */
export async function runOdooViews(url: string) {
  const names = new Set<string>()
  for (const e of MAP) {
    if (names.has(e.odoo)) throw new Error(`Nombre de Odoo repetido: ${e.odoo}`)
    names.add(e.odoo)
  }

  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('drop schema if exists odoo cascade')
    await client.query('create schema odoo')
    for (const e of MAP) {
      await client.query(`create view odoo.${ident(e.odoo)} as select t.*${e.extra ? `, ${e.extra}` : ''} from ${qualified(e.real)} t`)
    }
    // Equivalencias a la vista: qué tabla real hay detrás de cada nombre.
    const rows = MAP.map((e) => `('${e.odoo}', '${e.real}')`).join(',\n  ')
    await client.query(`create view odoo._mapa_tablas as select * from (values\n  ${rows}\n) as m(tabla_odoo, tabla_real) order by tabla_odoo`)
    await client.query('commit')

    // Tablas nuevas que aún no tienen vista: se avisa para no dejar la capa a medias sin que nadie lo note.
    const mapped = new Set(MAP.map((e) => e.real))
    const real = await client.query<{ t: string }>(
      `select table_schema || '.' || table_name as t from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema', 'drizzle', 'odoo')`,
    )
    const missing = real.rows.map((r) => r.t).filter((t) => !mapped.has(t))
    if (missing.length > 0) console.warn(`Aviso: ${missing.length} tabla(s) sin vista en odoo: ${missing.join(', ')}. Agrégalas a MAP en odoo-views.ts.`)
    return MAP.length
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

if (require.main === module) {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* sin .env: se usan las variables del entorno */
  }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  runOdooViews(url)
    .then((n) => console.log(`Esquema "odoo" listo: ${n} vistas (más odoo._mapa_tablas)`))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
