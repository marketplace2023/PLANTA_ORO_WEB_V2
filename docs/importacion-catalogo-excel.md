# Importación del listado maestro al catálogo

En el panel de administración, abre **Catálogo de activos → Importar Excel**. Selecciona el archivo `.xlsx`, pulsa **Analizar Excel**, revisa el resultado y pulsa **Importar al catálogo**. Solo el administrador global puede usar esta función.

La vista previa no guarda cambios. Muestra las altas y actualizaciones, el componente completo y las especificaciones por TAG. Si hay errores, indica la hoja y la fila y bloquea la importación.

## Mapeo

- `Listado maestro / Código CA` identifica la familia. Su nombre canónico se toma de `Categorías N4 / Categoría N4`; las variantes y comentarios de la categoría del listado no crean familias adicionales.
- `Tipo` identifica el tipo dentro de su familia. Un mismo nombre puede pertenecer a familias distintas.
- `Nombre` es el nombre del modelo.
- `Fabricante / modelo` se conserva íntegramente como nombre del fabricante, incluidos «Pendiente», «No indicado» y anotaciones. No se infieren marcas.
- `Denominación de etapa` se resuelve contra el nombre de una etapa existente. Cada modelo recibe su etapa propia; el tipo agrupa las etapas posibles de sus modelos.
- La red de los tipos incluidos se establece exclusivamente en `FUR-PROC` (Procesos).
- `Características / Componentes principales` se almacena en `technicalData.componentes` como un solo elemento, sin dividir su texto.
- `Especificaciones` se cruza por `TAG ACTIVO`. Cada parámetro se guarda en `specifications` con la unidad en la etiqueta, por ejemplo `Potencia del motor (kW)`. Los valores y rangos se conservan como texto.
- `TAG ACTIVO` se guarda en `catalog.asset_models.catalog_tag`, con unicidad, y en la identificación visible de la ficha. El panel y la búsqueda del catálogo permiten identificar estos modelos por TAG.

La carga crea modelos del catálogo global, sin crear activos físicos de una planta, fotos ni valores de parámetros técnicos. La ficha conserva su estado referencial pendiente de validación en planta.

## Actualizaciones y validación

Repetir un TAG actualiza su modelo y conserva su ID, su foto y las demás propiedades de sus datos técnicos. Las especificaciones y los componentes se reemplazan con los del nuevo archivo. Repetir un Código CA actualiza la familia, incluso si cambia su nombre. Los registros que no participan en la importación no se eliminan. Las etapas anteriores de tipos compartidos se conservan; sus redes quedan en Procesos según el mapeo.

Se rechazan TAG duplicados, referencias a TAG inexistentes, especificaciones repetidas, familias ambiguas y etapas desconocidas. No se crean etapas automáticamente. Se requieren las cuatro hojas y sus encabezados. El máximo es de 5 MB, 2.000 modelos y 25.000 filas por hoja.

La aplicación se ejecuta en una transacción y registra auditoría. La confirmación se vincula al archivo y al estado del catálogo revisado: si cambian, se debe analizar de nuevo. Un error revierte toda la carga.

## API y despliegue

- `POST /api/v1/catalog/imports/preview`: multipart con `file`; devuelve `fingerprint`, `issues`, `summary` y `rows`.
- `POST /api/v1/catalog/imports`: multipart con `file` y el `fingerprint` de la vista previa; devuelve el resultado y `imported`.

Instala las dependencias con `npm ci` y aplica las migraciones con `npm run db:migrate` antes de arrancar la API actualizada. La migración `0032_catalog_master_import.sql` añade el Código CA de las familias y el TAG único de los modelos. En producción, el comando `start:prod` ya aplica las migraciones al arrancar.
