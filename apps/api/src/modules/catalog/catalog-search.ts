import { and, desc, ilike, or, sql, type SQLWrapper } from 'drizzle-orm'
import { escapeLike } from '../../common/pagination'
import { assetModels, modelSearchDocuments, modelSearchQuantities } from '../../database/schema'

const combiningMarks = '[\u0300-\u036f]'
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const normalizedSql = (value: SQLWrapper) => sql`lower(regexp_replace(normalize(${value}, NFD), ${combiningMarks}, '', 'g'))`

/** Compara sin acentos ni distinción de mayúsculas, conservando el escape de LIKE. */
export function catalogSearch(value: SQLWrapper, pattern: string) {
  return ilike(normalizedSql(value), normalize(pattern))
}

type SearchTerm = { text: string } | { number: string; unit: string }
const numberPattern = '[+-]?(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)'
const quantity = new RegExp(`^(${numberPattern})([a-zµμ°%][a-z0-9µμ°%/^·*-]*)$`)
const numberOnly = new RegExp(`^${numberPattern}$`)
// Unidades separadas por espacio. Las unidades pegadas al número admiten cualquier símbolo.
const spacedUnits = new Set('hp cv w kw mw va kva mva a ma ka v mv kv hz khz mhz rpm bar mbar psi pa kpa mpa mm cm m km m2 m3 mm2 mm3 m2/s m3/h m3/s m3/min l ml l/h l/min l/s kg g mg t kg/h kg/s t/h kg/m3 t/m3 n kn nm n·m j kj mj °c °f k s ms min h % db ohm ω µm μm µs μs'.split(' '))
const stopWords = new Set('de del el la los las un una unos unas y en para con por'.split(' '))
const normalizeUnit = (unit: string) => normalize(unit).replace(/²/g, '2').replace(/³/g, '3').replace(/[µμ]/g, 'u')

export function catalogSearchTerms(search: string): SearchTerm[] {
  const tokens = normalize(search).split(/\s+/).filter(Boolean)
  const result: SearchTerm[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].replace(/²/g, '2').replace(/³/g, '3')
    const attached = token.match(quantity)
    const next = tokens[i + 1]?.replace(/²/g, '2').replace(/³/g, '3')
    if (attached) result.push({ number: attached[1], unit: normalizeUnit(attached[2]) })
    else if (numberOnly.test(token) && spacedUnits.has(next)) {
      result.push({ number: token, unit: normalizeUnit(next) })
      i++
    } else if (tokens.length === 1 || !stopWords.has(token)) result.push({ text: token })
  }
  return result.length ? result : [{ text: normalize(search) }]
}

// Estas proyecciones se preparan al guardar/importar, nunca al buscar.
const identityText = modelSearchDocuments.identity
const documentText = modelSearchDocuments.document
const searchVector = modelSearchDocuments.searchVector

function quantityMatch(term: { number: string; unit: string }) {
  return sql`exists (select 1 from ${modelSearchQuantities}
    where ${modelSearchQuantities.modelId} = ${assetModels.id}
      and ${modelSearchQuantities.unit} = ${term.unit}
      and ${modelSearchQuantities.amount} = ${term.number.replace(',', '.')}::numeric)`
}

/** Todos los términos deben coincidir; una cantidad y su unidad pertenecen a la misma especificación. */
export function buildCatalogSearch(search: string) {
  const terms = catalogSearchTerms(search)
  const words = terms.flatMap(term => 'text' in term ? [term.text] : [])
  const condition = and(...terms.map(term => {
    if ('number' in term) return quantityMatch(term)
    const literal = ilike(documentText, `%${escapeLike(term.text)}%`)
    // Los símbolos de TAG y LIKE se conservan literales; el diccionario español permite singular/plural.
    return /^[a-z]+$/.test(term.text)
      ? or(literal, sql`${searchVector} @@ plainto_tsquery('spanish', ${term.text})`)
      : literal
  }))!
  const rank = sql`ts_rank(${searchVector}, plainto_tsquery('spanish', ${words.join(' ')}))`
  const exactPhrase = ilike(identityText, `%${escapeLike(normalize(search))}%`)
  return {
    condition,
    order: words.length ? [
      desc(sql`case when ${exactPhrase} then 1 else 0 end`),
      desc(rank),
    ] : [],
  }
}
