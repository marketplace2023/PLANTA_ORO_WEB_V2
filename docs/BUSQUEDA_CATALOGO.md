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
cantidades se consultan por subconsulta indexada, sin multiplicar modelos por sus parámetros.

## Implementación y límites

Usa búsqueda de texto nativa (`to_tsvector`, `plainto_tsquery`, `ts_rank`) con
configuración `spanish`. La migración `0068_catalog_search_index` crea:

- `catalog.model_search_documents`: identificación y texto normalizados, vector
  ponderado y dos índices GIN (vector y texto con `pg_trgm`).
- `catalog.model_search_quantities`: pares unidad/cantidad numérica por modelo,
  deduplicados, con índice B-tree. Mantiene la relación valor/unidad del parámetro
  al extraerlos, antes de agregarlos por modelo.
- Triggers para generar ambas proyecciones al crear/editar modelos, sus referencias
  o especificaciones, y al renombrar/mover tipos o renombrar familias. El borrado
  de modelos elimina sus proyecciones por cascada.

La preparación ocurre al escribir, dentro de la misma transacción, no durante la
búsqueda. No hay cola ni espera de indexación posterior. Si se revierte una carga,
también se revierten las proyecciones. Los formularios, permisos, validaciones,
plantillas Excel y datos originales no cambian. Los activos propios de planta no
se duplican en este índice: busca modelos del catálogo.

Para evitar proyecciones desactualizadas ante ediciones concurrentes de modelo y
familia/tipo, un bloqueo asesor transaccional serializa las escrituras de esas tres
tablas del maestro. Las lecturas no toman ese bloqueo. Una importación conserva el
bloqueo hasta terminar su transacción; otra escritura del catálogo puede esperar.

El despliegue requiere aplicar la migración antes de usar la nueva API. Instala
`pg_trgm` y prepara los modelos existentes; no resetea ni cambia sus fichas. Esta
preparación inicial y las actualizaciones de muchas fichas tienen costo de escritura.
La migración se ha verificado desde ambas historias del repositorio y en ejecución
repetida sin duplicar datos.

No implementa corrección de erratas, búsqueda semántica, operadores OR/NOT ni
conversión de magnitudes. `pg_trgm` acelera las coincidencias literales existentes;
no habilita por sí solo tolerancia a errores. La capacidad a mayor escala debe
validarse midiendo; los índices no sustituyen una prueba de carga.

Pruebas: `catalog-search.spec.ts`, `catalog-search.e2e.spec.ts` y
`catalog-specification-search.e2e.spec.ts`, junto a las pruebas existentes de catálogo
y fabricantes de referencia. `catalog-search-index.e2e.spec.ts` verifica alta por
API, edición, metadatos, rollback, lotes, concurrencia y borrado; la suite de
importación comprueba que las cantidades recién importadas quedan buscables.
