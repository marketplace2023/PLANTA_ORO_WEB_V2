# Importación del listado maestro al catálogo

En el panel de administración, abre **Catálogo de activos → Importar Excel**. Selecciona el archivo `.xlsx` y una o varias **Redes transversales de los modelos**, pulsa **Analizar Excel**, revisa el resultado y pulsa **Importar al catálogo**. Solo el administrador global puede usar esta función.

La vista previa no guarda cambios. Muestra las altas y actualizaciones, todos los componentes, las especificaciones y los fabricantes de referencia por TAG. Si hay errores, indica la hoja y la fila y bloquea la importación. Si hay modelos sin especificaciones, muestra la opción **Importar también los modelos sin especificaciones técnicas** después del análisis. Debes marcarla para incluirlos con sus especificaciones vacías; los demás errores siguen bloqueando la carga.

**Descargar plantilla Excel** entrega una primera hoja de Instrucciones con ejemplos de asociación por TAG, las cuatro hojas de datos originales y la nueva hoja Fabricantes de referencia. Los ejemplos solo están en Instrucciones y no se importan. Las hojas de carga están vacías y el diccionario de familias está precargado.

## Mapeo

- `Listado maestro / Código CA` identifica la familia. Su nombre canónico se toma de `Categorías N4 / Categoría N4`; las variantes y comentarios de la categoría del listado no crean familias adicionales.
- `Tipo` identifica el tipo dentro de su familia. Un mismo nombre puede pertenecer a familias distintas.
- `Nombre` es el nombre del modelo.
- `Fabricante / modelo` (en libros antiguos) se ignora y deja de ser obligatorio. No crea ni actualiza marcas. Los fabricantes se toman únicamente de Fabricantes de referencia.
- `Denominación de etapa` se resuelve contra el nombre de una etapa existente. Cada modelo recibe su etapa propia; el tipo agrupa las etapas posibles de sus modelos.
- Cada modelo incluido recibe las redes elegidas en el importador. Se requiere al menos una red existente; no se lee ninguna columna de redes del Excel ni se asigna Procesos automáticamente.
- `Características / Componentes principales`: cada fila no vacía se agrega a `technicalData.componentes`. Se permite repetir el TAG en varias filas, se conserva su orden y no se divide el texto de una fila por comas o puntos. Los modelos sin filas o con texto vacío quedan sin componentes. La hoja sigue siendo obligatoria.
- `Especificaciones` se cruza por `TAG ACTIVO`. Cada parámetro se guarda en `specifications` con la unidad en la etiqueta, por ejemplo `Potencia del motor (kW)`. Los valores y rangos se conservan como texto.
- `Fabricantes de referencia` se cruza por `TAG ACTIVO`. Sus columnas son `TAG ACTIVO`, `Fabricante`, `Descripción` y `Sitio web`. Cada fila crea un elemento de `technicalData.fabricantesReferencia` con `nombre`, `alcance` y `sitioWeb`. TAG y nombre son obligatorios; descripción y web son opcionales. El nombre admite hasta 160 caracteres, la descripción hasta 2.000 y la web hasta 2.048, con protocolo HTTP(S). La ficha muestra la tabla de referencias y las tarjetas muestran sus nombres separados por coma. Son los únicos fabricantes asociados al modelo y alimentan el filtro del catálogo.
- `TAG ACTIVO` se guarda en `catalog.asset_models.catalog_tag`, con unicidad, y en la identificación visible de la ficha. El panel y la búsqueda del catálogo permiten identificar estos modelos por TAG.

La carga crea modelos del catálogo global, sin crear activos físicos de una planta, fotos ni valores de parámetros técnicos. La ficha conserva su estado referencial pendiente de validación en planta.

## Actualizaciones y validación

Los TAG de Listado maestro deben ser nuevos en el catálogo. Si alguno ya existe, la vista previa devuelve un error `TAG_ALREADY_EXISTS` con su fila real, el TAG y todas sus redes actuales, con nombre y código. Si no tiene redes, indica «sin redes asignadas». Se comparan los TAG sin distinguir mayúsculas/minúsculas y sin espacios exteriores. Elegir otras redes, cambiar el nombre o la etapa y aceptar modelos sin especificaciones no permite sobrescribir el TAG. No se omite esa fila para importar el resto: **se bloquea toda la carga sin guardar cambios**. Retira los TAG existentes y sus detalles del Excel y vuelve a analizar.

La API vuelve a comprobar los TAG al confirmar, dentro de la transacción y antes de escribir familias, tipos, fabricantes, modelos, etapas, redes o auditoría. Un TAG creado después del análisis también bloquea la confirmación. Los modelos existentes conservan sus IDs, fotos, especificaciones, componentes, referencias y redes cuando se rechaza el archivo.

Las familias y tipos siguen creándose o actualizándose por sus claves. Se mantiene la compatibilidad con modelos anteriores **sin TAG**: se pueden vincular a un TAG nuevo si coinciden en tipo, conjunto de fabricantes de referencia, nombre y etapa. Solo para esos modelos sin TAG se conservan la foto y las demás propiedades técnicas, se reemplazan las especificaciones, componentes y redes, y se conservan las referencias si falta su hoja. La ausencia de la hoja de referencias sigue siendo válida para libros anteriores.

La opción de especificaciones vacías solo omite avisos `MISSING_SPECIFICATIONS`; nunca omite TAG existentes. La aceptación se reinicia al analizar de nuevo, cambiar el archivo o cambiar las redes.

Si hay modelos nuevos con **tipo, conjunto de fabricantes de referencia, nombre y etapa** iguales, el análisis devuelve avisos `DUPLICATE_MODEL_IDENTITY` con sus filas y TAG. Por defecto bloquean la carga. Después de revisarlos, puedes marcar **Importar modelos duplicados con TAG distintos** para aceptar esas coincidencias en ese archivo. Se crean modelos independientes sin renombrarlos, cada uno con su TAG, ficha, especificaciones, componentes y foto propia. Esta opción es independiente de la aceptación de especificaciones vacías; si hay ambos avisos, se deben aceptar ambos. Ninguna opción omite TAG repetidos en Listado maestro, TAG ya existentes, etapas desconocidas ni otros errores. Las aceptaciones se reinician al analizar, cambiar el archivo o las redes.

Se rechazan TAG duplicados en Listado maestro, referencias a TAG inexistentes, especificaciones repetidas, familias ambiguas y etapas desconocidas. Repetir un TAG en Características, Especificaciones o Fabricantes de referencia es válido para asociar varias filas. No se crean etapas automáticamente. Se requieren las cuatro hojas originales y sus encabezados; Fabricantes de referencia es opcional para admitir libros anteriores, pero si aparece debe incluir sus cuatro encabezados. Instrucciones no se procesa. El máximo es de 5 MB, 2.000 modelos y 25.000 filas por hoja de datos.

La coincidencia entre modelos se comprueba por **tipo, conjunto de fabricantes de referencia, nombre y etapa efectiva**. Dos TAG pueden compartir los tres primeros campos si pertenecen a etapas diferentes. Si comparten también una etapa, requieren la aceptación explícita de duplicados para insertar modelos nuevos. Se comparan tanto las filas del archivo como los modelos existentes, incluyendo las etapas heredadas del tipo. Las coincidencias ya aceptadas no bloquean archivos posteriores de otros activos; cada nueva coincidencia vuelve a requerir aceptación. El importador ya no consolida marcas del maestro antiguo. Un TAG existente bloquea la carga aunque cambie de etapa; solo se adopta un modelo anterior sin TAG si coincide también en la etapa. Se valida el estado final de la carga completa.

La aplicación se ejecuta en una transacción y registra auditoría. La confirmación se vincula al archivo, las redes seleccionadas y el estado del catálogo revisado: si cambian, se debe analizar de nuevo. Un error revierte toda la carga.

Al importar TAG nuevos también se consolidan las variantes anteriores de los fabricantes presentes en el archivo. Sus modelos y activos físicos se reasignan al fabricante común antes de eliminar las variantes, conservando los IDs de los modelos y el país y sitio web del fabricante. La vista previa muestra cuántas variantes se unificarán. Si hay países o sitios web incompatibles, o la unificación produciría modelos duplicados, se bloquea para permitir revisar esa coincidencia.

## API y despliegue

Cambiar las redes en el formulario invalida la vista previa: vuelve a analizar antes de importar. La API también rechaza una confirmación cuyas redes no coincidan con las revisadas. Los códigos se normalizan a mayúsculas y se eliminan duplicados.

Cada fila de la vista previa incluye `components` y `referenceManufacturers`. Esta última propiedad es una lista de `{ nombre, alcance, sitioWeb }` si la hoja está presente, o `null` si falta y se conservarán los datos anteriores. Despliega la API actualizada antes o junto con el admin para aplicar el bloqueo de TAG existentes y usar la plantilla actualizada. Este bloqueo no requiere una migración adicional. Los componentes y fabricantes utilizan JSON existente; la identidad por etapa requiere la migración `0034` descrita abajo.

- `POST /api/v1/catalog/imports/preview`: multipart con `file` y `networkCodes` (texto JSON, por ejemplo `["FUR-PROC","FUR-PTE"]`); devuelve `fingerprint`, `networks`, `issues`, `summary` y `rows`.
- `POST /api/v1/catalog/imports`: multipart con `file`, `networkCodes` y el `fingerprint` de la vista previa; devuelve el resultado y `imported`. Admite el campo opcional `allowMissingSpecifications` como texto `true` o `false` (por defecto, `false`); solo permite omitir los avisos con código `MISSING_SPECIFICATIONS`, sin omitir las demás validaciones. La vista previa incluye esos avisos en `issues` con hoja, fila, mensaje y código.
- El mismo endpoint admite `allowDuplicateModels` como texto `true` o `false` (por defecto, `false`). Solo omite avisos `DUPLICATE_MODEL_IDENTITY`. La aceptación y los TAG de los modelos excepcionados quedan registrados en auditoría; la API vuelve a comprobar el archivo y el catálogo bajo bloqueo antes de guardar.

Instala las dependencias con `npm ci` y aplica las migraciones con `npm run db:migrate` antes de arrancar la API actualizada. La migración `0033_model_networks.sql` mueve las redes de tipos a modelos conservando las asignaciones existentes. La migración `0032_catalog_master_import.sql` añade el Código CA de las familias y el TAG único de los modelos. En producción, el comando `start:prod` ya aplica las migraciones al arrancar.

La migración `0034_model_stage_identity.sql` reemplaza la unicidad global por tipo/fabricante/nombre por claves por etapa efectiva, sin cambiar los IDs ni los datos de los modelos. PostgreSQL mantiene `catalog.asset_model_stage_keys` mediante triggers diferidos al confirmar transacciones de modelos, etapas del modelo y etapas del tipo. La clave por tipo/fabricante/nombre/etapa es única y diferida: protege también cambios manuales, herencia y escrituras concurrentes. La tabla es auxiliar y no debe editarse desde la aplicación. Los modelos sin etapas usan una clave de etapa UUID cero; los modelos sin fabricante conservan el comportamiento anterior, que no compara fabricantes nulos. No se renombran modelos ni se deducen nombres de etapa a partir de los TAG.

La migración `0035_import_duplicate_models.sql` permite excepciones explícitas por modelo mediante `duplicate_identity_allowed`, con valor inicial `false`. Exige un TAG y conserva su restricción única. Las claves normales mantienen ámbito UUID cero y las excepciones usan el ID del modelo como `identity_scope`, sin alterar nombre ni datos. Los cambios manuales ordinarios siguen protegidos, incluso cuando solo quedan excepciones de una combinación. Las excepciones existentes no se editan para aceptar otro modelo nuevo. Aplica esta migración antes de usar la opción; `start:prod` la ejecuta al desplegar la API. No se borra ningún dato.

Los comandos normales `db:seed`, `db:seed:dev` y `setup:local` dejan el catálogo y los activos sin ejemplos de demostración. Para reiniciar toda la base local, detén la API y ejecuta `npm run db:reset-local -- --yes`: conserva la base anterior con un nombre de respaldo y deja una nueva lista para importar desde este panel. El reinicio no vuelve a cargar el Excel; debes seleccionarlo e importarlo nuevamente.


## Eliminación masiva por Excel

En **Catálogo de activos → Eliminar por Excel**, selecciona el mismo `.xlsx` y pulsa **Analizar eliminación**. Solo se usa `Listado maestro / TAG ACTIVO`; no se necesitan las otras hojas, componentes ni especificaciones. Se admiten archivos de hasta 5 MB y 2.000 TAG únicos. Los TAG se recortan y convierten a mayúsculas; solo se comparan con `catalog.asset_models.catalog_tag`, sin coincidencias por nombre.

La vista previa muestra modelos por eliminar, TAG no encontrados y modelos bloqueados, junto con los conteos de uso en activos de planta, inventario y marketplace. Los TAG repetidos o inválidos deben corregirse. Los no encontrados se omiten.

Escribe **ELIMINAR** para confirmar. Si algún modelo está en uso por activos de planta o inventario se bloquea todo el listado: no hay eliminación parcial. El archivo y el estado revisado se vuelven a comprobar dentro de una transacción; si cambian, debes analizar de nuevo. La operación elimina los modelos coincidentes y sus vínculos de etapas, redes y valores del fabricante, y registra una auditoría con los datos anteriores. Las fotos se eliminan después de confirmar la transacción. Las publicaciones del marketplace se conservan y quedan sin modelo; su cantidad se informa antes de confirmar. Las familias, tipos y fabricantes se conservan.

- `POST /api/v1/catalog/deletions/preview`: multipart con `file`; devuelve `fingerprint`, `issues`, `summary` y `rows`, sin modificar datos.
- `POST /api/v1/catalog/deletions`: multipart con el mismo `file`, `fingerprint` y `confirm=ELIMINAR`; devuelve el resultado con `deleted`. Solo lo puede ejecutar el administrador global.


## Fabricantes de referencia como fuente única (migración 0036)

El modelo ya no tiene `manufacturerId` ni fabricante principal. La columna antigua `Fabricante / modelo` se ignora por completo, incluidos valores vacíos o errores de Excel. Los libros anteriores siguen siendo válidos. La plantilla nueva tiene seis columnas en Listado maestro; Denominación de etapa pasa a F. Las referencias siguen asociadas por TAG en su propia hoja.

`technicalData.fabricantesReferencia` es la única fuente. El editor del modelo admite varios nombres, descripciones y webs. La lista de fabricantes del catálogo y la pestaña Fabricantes se derivan de las fichas: no muestran el antiguo maestro de marcas. Los filtros públicos ofrecen referencias de modelos activos. Mayúsculas y espacios redundantes se agrupan en una opción con ID estable; cada filtro usa una consulta EXISTS, por lo que un modelo con varias referencias aparece una sola vez, también al contar y paginar. La búsqueda por texto incluye los nombres de referencia.

El control de identidad compara tipo, nombre, etapa efectiva y conjunto de nombres de referencia normalizados (sin importar su orden ni repetir nombres). Sin referencias se compara el conjunto vacío. Los TAG siguen siendo únicos y los duplicados necesitan aceptación explícita. La adopción de un modelo antiguo sin TAG conserva referencias cuando el archivo no incluye la hoja; no se adopta si hay varias coincidencias posibles.

La migración `0036_reference_manufacturers.sql` elimina únicamente la relación fabricante-modelo y reconstruye las claves por referencias. Conserva IDs, TAG, especificaciones, componentes, fotos, referencias, etapas y redes. Las coincidencias históricas que afloran al retirar la marca antigua se conservan como excepciones; no se borran ni renombran modelos. La tabla antigua de fabricantes se conserva para fabricantes instalados de activos físicos; importar modelos ya no la modifica ni fusiona marcas de activos físicos.

Desplegar API y frontends juntos. `start:prod` ejecuta la migración al iniciar la API. No hay que reimportar los Excel: las referencias ya guardadas pasan a alimentar los filtros automáticamente. Los filtros antiguos cuyo ID provenía del maestro de marcas deben seleccionarse de nuevo.
