# Recuperación de maestros LULO

**Actualización:** la recuperación ya se convirtió a maestros relacionales operativos y está integrada al home y al panel de planta 5174. La ubicación en Admin descrita más abajo corresponde a la implementación anterior. El recorrido vigente, los conteos y el comando de conversión están en [Maestros originales en planta](LULO_MAESTROS_EN_PLANTA.md).

Estado al 11 de noviembre de 2026: recuperación estructural, corrección auditada, aprobación de maestros y versiones internas de referencia implementadas. La validación de los precios reales la realiza el administrador con sus fuentes. Ya existe la activación de versiones para cálculo público y adopción en planta, documentada en [LULO operativo](LULO_OPERATIVO.md).

## Fuente original

Se recibió `LULO.MDB` en la carpeta de referencias. Se trasladó, conservando su SHA-256, a `.local/lulo-sources/LULO.MDB`, fuera del directorio público de Vite y de Git. El original se lee sin modificarlo, mediante `mdb-reader`.

Huella del archivo: `94c74923ed31f059d482d2a451b7873ea1a8899320cab799680cb3a1887e10bc`.

La recuperación permite también analizar los seis archivos JSON de maestros del prototipo anterior. Son fuentes distintas: sus APU por proyecto no se fusionan ni se consideran equivalentes a las composiciones maestras del MDB.

## Resultado de la lectura original

- 40 familias.
- 3.209 materiales, 672 equipos y 164 registros de mano de obra.
- 8.057 partidas y 8.057 APU maestros.
- 93.493 renglones de composición conservados.
- 20.199 registros de maestros en total; 15 requieren revisión.
- Ninguna descripción contiene el carácter de sustitución `U+FFFD` que aparecía en los JSON del prototipo.

Las observaciones incluyen cuatro insumos con precio histórico cero y once APU con cantidades no positivas. Uno de esos APU contiene además una referencia de equipo vacía. Una fila puede tener varias observaciones; los renglones observados se conservan, no se descartan ni se completan con valores inventados.

Solo se leen `ObraFami`, `ObraMate`, `ObraEqui`, `ObraMano`, `ObraPart`, `ObraPainMate`, `ObraPainEqui` y `ObraPainMano`. No se importan obras privadas, presupuestos, usuarios, bancos ni clientes. Los APU originales de esas tablas son maestros; las copias contextuales `ObraApun`/`ObraApin*` quedan excluidas.

## Precios y bases de costo pendientes

Los importes permanecen como `HISTORICAL_UNVERIFIED`, con moneda sin confirmar. No se presume que sean precios actuales ni se convierten automáticamente a USD o VES.

El equipo conserva por separado adquisición (`CosEqu`), costo diario (`CosDia`), depreciación (`Deprec`) y transporte (`Transp`). Cada composición conserva su propio coeficiente de depreciación; no se sustituye por el del maestro. Mano de obra conserva `Salari` sin inventar un período. El MDB no define una unidad de tarifa para equipo/mano de obra en estos maestros: no se asigna «hora» por defecto. Los costos por renglón que no existen en la composición maestra permanecen nulos.

Antes de publicar una revisión utilizable para calcular se deben confirmar moneda/denominación, fecha base y vigencia, unidades y períodos, coeficientes y reglas de cálculo, y resolver las 15 observaciones. El motor actual de presupuestos de planta no se ha cambiado.

## Ejecución reproducible

Desde la raíz de `planta_beneficio_oro`, PowerShell:

```powershell
$source = (Resolve-Path '.local/lulo-sources/LULO.MDB').Path
$report = Join-Path (Get-Location).Path '.local/lulo-sources/informe-mdb.json'
npm run lulo:recover -w @fur/api -- --source "$source" --output "$report"
```

El comando anterior solo analiza y escribe el informe. Para incorporar el lote privado a la base local, después de aplicar las migraciones aditivas normales:

```powershell
npm run lulo:recover -w @fur/api -- --source "$source" --output "$report" --apply
```

`--apply` acepta únicamente `fur_dev` en localhost/127.0.0.1. Una huella de archivos y versión identifica cada lote; una transacción y un bloqueo por huella evitan duplicados incluso con importaciones simultáneas. Los errores de estructura o números inválidos detienen el lote completo: no se reemplazan por cero.

Lote MDB recuperado localmente: `01a1cbd3-7d06-7d18-8103-6ead9af85cc6`. El informe de esta ejecución está en `../outputs/lulo-migration-20261111/informe-mdb.json`, relativo a la raíz del repositorio. La comparación anterior desde JSON se conserva como un lote separado para trazabilidad.

## Revisión en Admin

En el panel de administración, **Catálogos maestros → Maestros LULO**, ruta `/budget-catalog`, se pueden consultar lotes, buscar códigos/descripciones, filtrar por tipo/estado y abrir los datos originales. Se usa paginación en servidor; no se descarga toda la biblioteca al navegador.

Las rutas `/admin/budget-catalog/*` exigen autenticación y administración global. El listado de registros no incluye el contenido completo de precios/composiciones; el detalle privado permite revisarlo. La importación no publica precios ni acepta rutas arbitrarias por HTTP.

Las tablas `budget.master_batches` y `budget.master_entries` mantienen la fuente original. `budget.master_reviews` guarda las revisiones de trabajo; `budget.catalog_releases` y `budget.catalog_release_entries` guardan versiones fijas. Esta biblioteca continúa separada del catálogo técnico de activos, productos de vendedores e insumos privados de planta. No se modificaron presupuestos existentes.

## Corrección, aprobación y versiones

1. Abra **Biblioteca y revisión** y seleccione el lote original MDB. Use **Observaciones de origen → Con observaciones en la importación** para localizar los 15 registros señalados. Ese indicador describe el archivo recibido y no se elimina al corregirlo.
2. Abra el código de un maestro. Corrija descripción/unidad y, en los insumos, seleccione una familia del mismo tipo. Para APU puede cambiar referencias, cantidades y coeficientes o agregar/quitar renglones. El motivo obligatorio documenta la modificación; el original permanece disponible en **Datos originales de la importación**.
3. Active **Registrar precio verificado** solo cuando pueda respaldarlo. Complete importe decimal, moneda de tres letras, denominación, fecha base, fecha límite de vigencia, base de costo y fuente de verificación. No hay conversión monetaria implícita ni copia automática del precio histórico. Los equipos/mano de obra usan tarifa por hora (`H`) o día (`DIA`), no adquisición. Las fechas de vigencia se contrastan con la fecha UTC del servidor.
4. Guarde la corrección e indique el motivo de aprobación. El servidor comprueba unidades, rendimientos, cantidades, referencias, precio positivo, fecha base no futura y vigencia. Apruebe primero familias e insumos, después partidas y APU. En APU debe documentar la base del rendimiento y su criterio de composición. Guardar otra modificación vuelve el registro a borrador.
5. Consulte **Historial** para ver responsable, fecha, motivo y valores antes/después. Dos correcciones de la misma revisión no pueden sobrescribirse: la segunda recibe un conflicto y puede recargar la revisión guardada.
6. Marque hasta 200 maestros raíz en la biblioteca y abra **Versiones del catálogo**. Prepare una selección con nombre y motivo; el servidor añade todas sus dependencias. Todo el conjunto debe estar aprobado, vigente y actualizado. Una versión piloto usa una sola moneda/denominación y una sola variante por código. Repetir una preparación idéntica devuelve la versión existente.
7. Examine la copia preparada y use **Publicar versión de referencia** con un motivo. Antes de publicar se comprueban de nuevo revisiones y vigencias. La versión queda fija, con huella de contenido y trazabilidad; no tiene un endpoint de edición. Repetir la publicación no genera otra versión ni otra publicación.

Una aprobación registra las revisiones de sus dependencias. Si cambia una familia o un insumo, el APU relacionado requiere revalidación para la siguiente versión. El contador de aprobaciones muestra las aprobaciones registradas: la preparación/publicación siempre comprueba además su validez actual. Una versión publicada conserva su contenido histórico aunque los maestros cambien o venza después un precio.

**Alcance de publicación:** publicar una versión fija la biblioteca interna de referencia (`REFERENCE_ONLY`). Para usarla en la web se debe **Activar en home y planta**, acción separada que comprueba el perfil de cálculo y la vigencia de precios. El perfil `FUR_LULO_MVP_1` aplica tarifas de uso verificadas, sin volver a multiplicarlas por los coeficientes de adquisición del legado. Los presupuestos anteriores mantienen su motor original.

La migración aditiva `0047_lulo_catalog_review.sql` incorpora estas tablas. Los cambios y aprobaciones, la preparación y la publicación registran eventos en la auditoría compartida `audit.events`.

Endpoints administrativos adicionales:

- `GET/PATCH /admin/budget-catalog/entries/:id/review`.
- `POST /admin/budget-catalog/entries/:id/approve`.
- `GET /admin/budget-catalog/entries/:id/history?page=1`.
- `GET /admin/budget-catalog/batches/:id/review-summary`.
- `GET/POST /admin/budget-catalog/batches/:id/releases`.
- `GET /admin/budget-catalog/releases/:id?page=1`.
- `POST /admin/budget-catalog/releases/:id/publish`.

## Siguiente entrega del plan

La recuperación y el flujo administrativo dejan preparada la base de L0/L1. Se requiere aportar y verificar los valores económicos reales de la selección piloto; no se aprobaron datos históricos con valores inventados. Ya están implementados el cálculo decimal conciliado con el caso Python, las publicaciones compartidas, la estimación pública, adopción en planta, revisión/emisión, versiones sucesoras y cuatro reportes PDF/Excel. Los pasos operativos están en [LULO operativo](LULO_OPERATIVO.md). Control de obra, reconsideraciones/cierre y equivalencia ampliada mantienen el alcance posterior del [plan de ejecución](PLAN_EJECUCION_LULO_INTEGRADO.md).
