# Búsqueda del catálogo

`GET /api/v1/catalog/assets?search=...` aplica la misma búsqueda al catálogo público,
al panel de administración y a los selectores de modelos de planta.

## Comportamiento

- Ignora acentos y mayúsculas.
- Busca en nombre, TAG, tipo, familia, fabricantes de referencia y especificaciones
  con valor. No busca en descripciones del tipo ni en componentes.
- Combina todos los términos, aunque aparezcan en distintos campos y en otro orden.
  Por ejemplo, `motor acero inoxidable` puede encontrar «motor» en el nombre y
  «acero inoxidable» en el material de una especificación.
- El diccionario español de PostgreSQL permite coincidencias por raíz, como
  `motor` y `motores`. Se conservan las coincidencias parciales literales.
- Reconoce cantidades como `5hp`, `5 hp`, `0,5kW` y `0.5 kW`. Cuando la unidad
  está en el nombre del parámetro (`Potencia (hp)`), busca el número en el valor
  de **esa misma especificación**. También reconoce valores como `≈ 5 hp` y
  cantidades escritas en el nombre/TAG/tipo/familia del modelo.
- Unidades separadas por espacio: símbolos habituales declarados en
  `catalog-search.ts`. Los símbolos pegados al número también admiten otras unidades.
- `5`, `5.0` y `5,00` son equivalentes; `15`, `50` y `5.5` no coinciden con `5`.
  No se convierten unidades: `5 hp` no se transforma en kW.
- Valores vacíos, nulos o `No aplica` no aportan texto a la búsqueda.
- `%`, `_` y `\` del usuario se escapan, no son comodines de SQL.

## Orden y filtros

Con búsqueda, primero aparecen las coincidencias de la frase en la identificación
del modelo; después se usa relevancia de texto (`ts_rank`). Nombre/TAG/tipo/familia
tienen más peso que fabricantes y especificaciones. Los empates conservan el orden
por nombre, familia, tipo e ID. Sin búsqueda se mantiene ese orden alfabético.

Los filtros de familia, tipo, fabricante, etapa, red y estado siguen aplicándose.
La consulta de elementos y la de total comparten la condición de búsqueda. Las
especificaciones se consultan por subconsulta, sin multiplicar modelos por sus parámetros.

## Implementación y límites

Usa JSONB y búsqueda de texto nativa (`to_tsvector`, `plainto_tsquery`, `ts_rank`)
con configuración `spanish`. No requiere migraciones, extensiones ni un servicio
Elasticsearch. Las ediciones de fichas se reflejan inmediatamente.

Los documentos de búsqueda se calculan durante la consulta. Si el catálogo crece
considerablemente, se debe medir con `EXPLAIN ANALYZE` y persistir/indexar estos
documentos mediante GIN antes de afirmar rendimiento a gran escala.

No implementa corrección de erratas, búsqueda semántica, operadores OR/NOT ni
conversión de magnitudes. `pg_trgm` sería una ampliación independiente para
tolerancia a errores de escritura.

Pruebas: `catalog-search.spec.ts`, `catalog-search.e2e.spec.ts` y
`catalog-specification-search.e2e.spec.ts`, junto a las pruebas existentes de catálogo
y fabricantes de referencia.
