# Importación del listado maestro al catálogo

En el panel de administración, abre **Catálogo de activos → Importar Excel**. Selecciona el archivo `.xlsx` y una o varias **Redes transversales de los modelos**, pulsa **Analizar Excel**, revisa el resultado y pulsa **Importar al catálogo**. Solo el administrador global puede usar esta función.

La vista previa no guarda cambios. Muestra las altas y actualizaciones, el componente completo y las especificaciones por TAG. Si hay errores, indica la hoja y la fila y bloquea la importación. Si hay modelos sin especificaciones, muestra la opción **Importar también los modelos sin especificaciones técnicas** después del análisis. Debes marcarla para incluirlos con sus especificaciones vacías; los demás errores siguen bloqueando la carga.

## Mapeo

- `Listado maestro / Código CA` identifica la familia. Su nombre canónico se toma de `Categorías N4 / Categoría N4`; las variantes y comentarios de la categoría del listado no crean familias adicionales.
- `Tipo` identifica el tipo dentro de su familia. Un mismo nombre puede pertenecer a familias distintas.
- `Nombre` es el nombre del modelo.
- `Fabricante / modelo` usa solo el texto fuera de paréntesis. Se eliminan notas, incluso varios grupos o paréntesis anidados, y se normalizan los espacios. Por ejemplo, `Releven (REV08 INV-060)` y `Releven (REV08 INV-062)` corresponden al mismo fabricante `Releven`. «Pendiente» y «No indicado» se conservan como nombres si aparecen fuera de los paréntesis. No se infieren marcas.
- `Denominación de etapa` se resuelve contra el nombre de una etapa existente. Cada modelo recibe su etapa propia; el tipo agrupa las etapas posibles de sus modelos.
- Cada modelo incluido recibe las redes elegidas en el importador. Se requiere al menos una red existente; no se lee ninguna columna de redes del Excel ni se asigna Procesos automáticamente.
- `Características / Componentes principales` se almacena en `technicalData.componentes` como un solo elemento, sin dividir su texto.
- `Especificaciones` se cruza por `TAG ACTIVO`. Cada parámetro se guarda en `specifications` con la unidad en la etiqueta, por ejemplo `Potencia del motor (kW)`. Los valores y rangos se conservan como texto.
- `TAG ACTIVO` se guarda en `catalog.asset_models.catalog_tag`, con unicidad, y en la identificación visible de la ficha. El panel y la búsqueda del catálogo permiten identificar estos modelos por TAG.

La carga crea modelos del catálogo global, sin crear activos físicos de una planta, fotos ni valores de parámetros técnicos. La ficha conserva su estado referencial pendiente de validación en planta.

## Actualizaciones y validación

Repetir un TAG actualiza su modelo y conserva su ID, su foto y las demás propiedades de sus datos técnicos. Las especificaciones y los componentes se reemplazan con los del nuevo archivo. Repetir un Código CA actualiza la familia, incluso si cambia su nombre. Los registros que no participan en la importación no se eliminan. Las etapas anteriores de tipos compartidos se conservan. Las redes de los modelos incluidos se reemplazan por las seleccionadas para esta carga; los demás modelos del mismo tipo mantienen sus propias redes.

Al importar con la opción de especificaciones vacías se reemplazan también las especificaciones anteriores de esos modelos. La aceptación se reinicia al analizar de nuevo, cambiar el archivo o cambiar las redes.

Se rechazan TAG duplicados, referencias a TAG inexistentes, especificaciones repetidas, familias ambiguas y etapas desconocidas. No se crean etapas automáticamente. Se requieren las cuatro hojas y sus encabezados. El máximo es de 5 MB, 2.000 modelos y 25.000 filas por hoja.

La aplicación se ejecuta en una transacción y registra auditoría. La confirmación se vincula al archivo, las redes seleccionadas y el estado del catálogo revisado: si cambian, se debe analizar de nuevo. Un error revierte toda la carga.

Al reimportar también se consolidan las variantes anteriores de los fabricantes presentes en el archivo. Sus modelos y activos físicos se reasignan al fabricante común antes de eliminar las variantes, conservando los IDs de los modelos y el país y sitio web del fabricante. La vista previa muestra cuántas variantes se unificarán. Si hay países o sitios web incompatibles, o la unificación produciría modelos duplicados, se bloquea para permitir revisar esa coincidencia.

## API y despliegue

Cambiar las redes en el formulario invalida la vista previa: vuelve a analizar antes de importar. La API también rechaza una confirmación cuyas redes no coincidan con las revisadas. Los códigos se normalizan a mayúsculas y se eliminan duplicados.

- `POST /api/v1/catalog/imports/preview`: multipart con `file` y `networkCodes` (texto JSON, por ejemplo `["FUR-PROC","FUR-PTE"]`); devuelve `fingerprint`, `networks`, `issues`, `summary` y `rows`.
- `POST /api/v1/catalog/imports`: multipart con `file`, `networkCodes` y el `fingerprint` de la vista previa; devuelve el resultado y `imported`. Admite el campo opcional `allowMissingSpecifications` como texto `true` o `false` (por defecto, `false`); solo permite omitir los avisos con código `MISSING_SPECIFICATIONS`, sin omitir las demás validaciones. La vista previa incluye esos avisos en `issues` con hoja, fila, mensaje y código.

Instala las dependencias con `npm ci` y aplica las migraciones con `npm run db:migrate` antes de arrancar la API actualizada. La migración `0033_model_networks.sql` mueve las redes de tipos a modelos conservando las asignaciones existentes. La migración `0032_catalog_master_import.sql` añade el Código CA de las familias y el TAG único de los modelos. En producción, el comando `start:prod` ya aplica las migraciones al arrancar.

Los comandos normales `db:seed`, `db:seed:dev` y `setup:local` dejan el catálogo y los activos sin ejemplos de demostración. Para reiniciar toda la base local, detén la API y ejecuta `npm run db:reset-local -- --yes`: conserva la base anterior con un nombre de respaldo y deja una nueva lista para importar desde este panel. El reinicio no vuelve a cargar el Excel; debes seleccionarlo e importarlo nuevamente.
