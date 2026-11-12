# LULO: maestros originales en home y panel de planta

**Actualización del 12 de noviembre:** se completó la ampliación funcional de presupuestación, ejecución y cierre. El recorrido vigente está en [LULO: tres etapas](LULO_TRES_ETAPAS.md). Las limitaciones de control/cierre descritas al final de este documento corresponden al estado anterior.

Corrección aplicada el 11 de noviembre de 2026. La ubicación operativa es el **panel de planta**, no Admin. El home utiliza el mismo catálogo común para consulta y estimaciones sin registro.

## Abrir la funcionalidad

- Home / acceso público: `http://localhost:5173/budgets`.
- Panel de planta: `http://localhost:5174/plants/revemin-ii/budgets`.
- Acceso desde la web con contexto de planta: `http://localhost:5173/plants/revemin-ii/budgets`.

En planta, **Maestros y estimación** muestra **Partidas maestras**, **Materiales**, **Equipos**, **Mano de obra** y **Familias**. **Mis presupuestos** lista los documentos propios. **Control y valorizaciones** mantiene las funciones anteriores y sus datos.

Se retiraron del menú y de las rutas de Admin los maestros LULO. Los registros de recuperación y las APIs administrativas anteriores se conservan como antecedentes técnicos; no son un requisito para consultar los maestros convertidos.

## Conversión realizada

Fuente: `.local/lulo-sources/LULO.MDB`, sin modificar el original, SHA-256 `94c74923ed31f059d482d2a451b7873ea1a8899320cab799680cb3a1887e10bc`.

| Maestro | Registros convertidos |
| --- | ---: |
| Partidas con APU | 8.057 |
| Materiales | 3.209 |
| Equipos | 672 |
| Mano de obra | 164 |
| Familias | 40 |
| Renglones de composición | 93.493 |

Las tablas operativas relacionales son `budget.lulo_master_catalogs`, `lulo_master_families`, `lulo_master_resources`, `lulo_master_items` y `lulo_master_components`. Cada fila conserva su vínculo con la recuperación original; no se usan únicamente documentos JSON de recuperación para simular estos catálogos.

Se conservan código, descripción, unidad, rendimiento, PU original y composición por tipo de insumo. En equipo se distinguen adquisición, costo diario y depreciación. Los campos restantes del registro fuente se conservan en `source_fields` y se pueden consultar en la ficha privada. No se importan obras, clientes, bancos ni usuarios del MDB.

Las 15 observaciones originales siguen identificadas. Se preservan los cuatro precios cero, los once APU con cantidades no positivas y la referencia de equipo ausente. El desglose identifica la referencia ausente; no se inventa un insumo. Puede usarse el PU original como referencia sin desglose mientras se revisa la partida.

## Consultar y presupuestar

1. Abra un tipo de maestro y busque por código o descripción; puede filtrar por familia. La lista es paginada y muestra los conteos del catálogo convertido.
2. Abra el código de una partida. La ficha muestra rendimiento, PU original y sus grupos de materiales, equipos y mano de obra.
3. **Presupuestar con este APU** crea una línea calculada desde su composición. **Usar PU original sin desglose** crea una línea manual con vínculo al maestro y motivo de referencia histórica.
4. Defina capítulos, cantidades, recargos, impuesto y moneda del documento. El servidor calcula importes con aritmética decimal. El perfil de cálculo es `FUR_LULO_MVP_1`: materiales por unidad y cuadrillas por rendimiento de jornada; conserva por separado el PU histórico original para comparación. No declara equivalencia automática con todos los parámetros de LuloWin.
5. Para calcular con precios sin confirmar, marque explícitamente el uso de **referencia histórica preliminar**. Elegir USD o VES como moneda del documento no transforma los importes históricos del MDB.
6. El visitante conserva su borrador en el navegador y puede descargar PDF/Excel preliminares. Con sesión y permiso puede guardarlo en una planta. Los borradores privados de planta no se escriben en almacenamiento público del navegador.

## Ajustes propios y documentos

Con `budget.edit`, la ficha permite **Editar para esta planta**: descripción, unidad, precio, moneda, fecha base, vigencia, fuente; en partidas, rendimiento y cantidades de composición. Confirmar un precio exige importe, moneda, fechas y fuente. Guardar exige un motivo y la revisión esperada.

Los cambios se guardan en `budget.lulo_plant_master_values` y se auditan. No alteran la base común del home ni los precios de otra planta. Un precio privado expresado en una moneda distinta a la del presupuesto se rechaza; no hay conversión implícita.

Al guardar un presupuesto se congelan sus insumos, composición, precios y resultado. Actualizar un maestro no modifica documentos guardados. Desde el borrador, **Actualizar precios** muestra el impacto y exige confirmación para recalcular las partidas seleccionadas.

El flujo es borrador → revisión → emisión; los emitidos se modifican mediante una nueva versión. Los precios históricos o vencidos impiden emitir, sin bloquear la consulta y preparación referencial. Los reportes históricos indican expresamente que no se ha confirmado la moneda de origen.

## Reproducir la conversión

Desde `planta_beneficio_oro`, con el MDB ya recuperado en el lote de origen:

```powershell
npm run db:migrate -w @fur/api
npm run lulo:convert -w @fur/api
```

La migración es `0049_lulo_real_masters.sql`. El convertidor verifica los conteos y es idempotente: repetirlo no duplica maestros. La herramienta local solo admite `fur_dev` en localhost. No instala un ejemplo ficticio como catálogo principal; desactiva la publicación demostrativa previa sin borrar su historial.

APIs públicas: `/budget-masters/catalogs`, `/budget-masters?kind=ITEM|MATERIAL|EQUIPMENT|LABOR|FAMILY`, `/budget-masters/:id`. Sus equivalentes privados son `/plants/:plantId/lulo/masters`, con lectura y edición por permisos. El cálculo privado sin guardar y sus reportes usan `/plants/:plantId/lulo/calculate` y `/plants/:plantId/lulo/report`.

## Verificación

Se comprobó la conciliación completa en la base local, la consulta HTTP de los cinco tipos y la composición de EDF-9001: cuatro materiales, seis equipos y seis registros de mano de obra. Se calculó esta partida usando sus 16 renglones reales y se generaron PDF/Excel con marca histórica y total coincidente; se revisó el PDF renderizado.

Las pruebas cubren conversión idempotente, referencias ausentes preservadas, diferencias entre adquisición y costo diario, consulta anónima, permisos, revisión optimista, aislamiento de precios por planta y conservación de documentos. También cubren las secciones visibles dentro del panel de planta 5174, el editor público y las regresiones del módulo anterior.

La carga y consulta de los maestros está realizada. Lo pendiente sobre esos importes es su revisión económica; no se afirma que sean cotizaciones vigentes. Control de obra ampliado, reconsideraciones y cierre completo siguen fuera de esta corrección.
