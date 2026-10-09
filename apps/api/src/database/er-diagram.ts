import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import { MAP } from './odoo-views'

/**
 * Diagrama entidad-relación con los nombres de Odoo. Las vistas del esquema `odoo` no pueden tener claves foráneas,
 * así que las relaciones se leen de las claves foráneas reales de las tablas y se dibujan con el nombre de cada vista.
 * Genera `docs/er-odoo.md` (Mermaid: se ve en VS Code o GitHub) y `docs/er-odoo.html` (se abre en el navegador).
 */

/** Agrupa por esquema real: cada grupo es un diagrama (un diagrama con las 74 tablas no se podría leer). */
const GROUPS: Array<{ title: string; schemas: string[] }> = [
  { title: 'Productos (catálogo, activos físicos y marketplace)', schemas: ['catalog', 'asset', 'marketplace'] },
  { title: 'Empresas, usuarios y permisos', schemas: ['core', 'iam', 'audit'] },
  { title: 'Proveedores y contratistas', schemas: ['provider', 'professional'] },
  { title: 'Inventario', schemas: ['inventory'] },
  { title: 'Mantenimiento', schemas: ['maintenance'] },
  { title: 'Compras', schemas: ['procurement'] },
  { title: 'Procesos de planta y redes', schemas: ['process', 'plant'] },
  { title: 'Presupuestos y valorizaciones', schemas: ['budget'] },
  { title: 'Documentos', schemas: ['document'] },
  { title: 'Capacitación (eLearning)', schemas: ['lms'] },
]

type Fk = { from: string; to: string; column: string; nullable: boolean }
type Col = { table: string; name: string; type: string; pk: boolean; fk: boolean }

const odooName = new Map(MAP.map((e) => [e.real, e.odoo]))
const mermaidType = (t: string) =>
  ({ 'character varying': 'varchar', 'timestamp with time zone': 'timestamptz', 'timestamp without time zone': 'timestamp', integer: 'int', boolean: 'bool', 'double precision': 'float' })[t] ?? t.replace(/[^a-z0-9_]/gi, '')

async function load(url: string) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  try {
    const fks = await pool.query<{ from_t: string; to_t: string; col: string; nullable: boolean }>(`
      select fn.nspname || '.' || fc.relname as from_t, tn.nspname || '.' || tc.relname as to_t, a.attname as col, not a.attnotnull as nullable
      from pg_constraint con
      join pg_class fc on fc.oid = con.conrelid join pg_namespace fn on fn.oid = fc.relnamespace
      join pg_class tc on tc.oid = con.confrelid join pg_namespace tn on tn.oid = tc.relnamespace
      join lateral unnest(con.conkey) as k(attnum) on true
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      where con.contype = 'f' order by 1, 2, 3`)
    const cols = await pool.query<{ t: string; name: string; type: string; pk: boolean }>(`
      select c.table_schema || '.' || c.table_name as t, c.column_name as name, c.data_type as type,
             exists (select 1 from information_schema.table_constraints tc join information_schema.key_column_usage kcu
                       on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
                     where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = c.table_schema and tc.table_name = c.table_name and kcu.column_name = c.column_name) as pk
      from information_schema.columns c order by c.table_schema, c.table_name, c.ordinal_position`)
    return {
      fks: fks.rows.map((r): Fk => ({ from: r.from_t, to: r.to_t, column: r.col, nullable: r.nullable })).filter((f) => odooName.has(f.from) && odooName.has(f.to)),
      cols: cols.rows.filter((r) => odooName.has(r.t)),
    }
  } finally {
    await pool.end()
  }
}

/** Un diagrama Mermaid: las tablas del grupo con sus columnas clave y las relaciones que las tocan. */
function diagram(schemas: string[], fks: Fk[], cols: Col[], full: boolean) {
  const inGroup = (real: string) => schemas.includes(real.split('.')[0])
  const related = fks.filter((f) => inGroup(f.from) || inGroup(f.to))
  const lines = ['erDiagram']

  const tables = [...odooName.keys()].filter(inGroup).sort((a, b) => odooName.get(a)!.localeCompare(odooName.get(b)!))
  for (const real of tables) {
    const mine = cols.filter((c) => c.table === real)
    // Por defecto solo la clave primaria, las claves foráneas y el nombre/código; con `full`, todo.
    const shown = mine.filter((c) => full || c.pk || c.fk || /^(name|code|tag|title|email|status)$/.test(c.name))
    lines.push(`  ${odooName.get(real)} {`)
    for (const c of shown) lines.push(`    ${mermaidType(c.type)} ${c.name}${c.pk ? ' PK' : c.fk ? ' FK' : ''}`)
    lines.push('  }')
  }
  for (const f of related) {
    // El lado «uno» es la tabla referenciada; opcional si la columna admite null.
    const left = f.nullable ? '|o' : '||'
    lines.push(`  ${odooName.get(f.to)} ${left}--o{ ${odooName.get(f.from)} : "${f.column}"`)
  }
  return { text: lines.join('\n'), tables: tables.length, relations: related.length }
}

export async function generateEr(url: string, outDir: string, full = false) {
  const { fks, cols } = await load(url)
  const fkSet = new Set(fks.map((f) => `${f.from}.${f.column}`))
  const columns: Col[] = cols.map((c) => ({ table: c.t, name: c.name, type: c.type, pk: c.pk, fk: fkSet.has(`${c.t}.${c.name}`) }))

  const sections = GROUPS.map((g) => ({ title: g.title, ...diagram(g.schemas, fks, columns, full) }))
  const overview = ['erDiagram', ...fks.map((f) => `  ${odooName.get(f.to)} ${f.nullable ? '|o' : '||'}--o{ ${odooName.get(f.from)} : "${f.column}"`)].join('\n')

  const stamp = new Date().toISOString().slice(0, 10)
  const md = [
    '# Diagrama entidad-relación (nombres de Odoo)',
    '',
    `Generado el ${stamp} desde las claves foráneas reales (${fks.length} relaciones entre ${odooName.size} tablas). Cada entidad lleva el nombre de su vista en el esquema \`odoo\`; la equivalencia con la tabla real está en \`odoo._mapa_tablas\`. Se regenera con \`npm run db:er\`.`,
    '',
    '## Vista general',
    '',
    '```mermaid',
    overview,
    '```',
    '',
    ...sections.flatMap((s) => [`## ${s.title}`, '', `${s.tables} tablas · ${s.relations} relaciones que las tocan. Las entidades sin columnas pertenecen a otro grupo.`, '', '```mermaid', s.text, '```', '']),
  ].join('\n')

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Diagrama entidad-relación</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;background:#f6f8fb;color:#0b1f3a}
  header{background:#0b1f3a;color:#fff;padding:16px 24px}
  header h1{margin:0;font-size:20px} header p{margin:4px 0 0;opacity:.75;font-size:13px}
  nav{position:sticky;top:0;background:#fff;border-bottom:1px solid #d9e0ea;padding:8px 24px;display:flex;gap:6px;flex-wrap:wrap;z-index:5}
  nav a{font-size:13px;color:#0b1f3a;text-decoration:none;border:1px solid #d9e0ea;border-radius:6px;padding:4px 10px}
  nav a:hover{background:#fdb913;border-color:#fdb913}
  main{padding:16px 24px;display:grid;gap:20px}
  section{background:#fff;border:1px solid #d9e0ea;border-radius:10px;padding:14px 16px;overflow:auto}
  h2{margin:0 0 4px;font-size:16px} small{color:#5b6b80}
</style></head><body>
<header><h1>Diagrama entidad-relación · nombres de Odoo</h1><p>Generado el ${stamp} · ${fks.length} relaciones entre ${odooName.size} tablas</p></header>
<nav><a href="#general">Vista general</a>${sections.map((s, i) => `<a href="#g${i}">${s.title.replace(/ \(.*/, '')}</a>`).join('')}</nav>
<main>
<section id="general"><h2>Vista general</h2><small>Todas las relaciones; los nombres de columna están en cada grupo.</small><pre class="mermaid">${overview}</pre></section>
${sections.map((s, i) => `<section id="g${i}"><h2>${s.title}</h2><small>${s.tables} tablas · ${s.relations} relaciones. Las entidades sin columnas pertenecen a otro grupo.</small><pre class="mermaid">${s.text}</pre></section>`).join('\n')}
</main>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
  mermaid.initialize({ startOnLoad: true, theme: 'neutral', maxTextSize: 400000, er: { useMaxWidth: false } })
</script></body></html>`

  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'er-odoo.md'), md, 'utf8')
  writeFileSync(path.join(outDir, 'er-odoo.html'), html, 'utf8')
  return { relations: fks.length, tables: odooName.size, outDir }
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
  const outDir = path.resolve(__dirname, '../../../../docs')
  generateEr(url, outDir, process.argv.includes('--full'))
    .then((r) => console.log(`Diagrama listo: ${r.relations} relaciones entre ${r.tables} tablas → ${r.outDir}\\er-odoo.html y er-odoo.md`))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
