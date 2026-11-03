# Ficha técnica propia de cada activo físico

El catálogo global proporciona la plantilla. Cada unidad de una planta conserva su propia copia de especificaciones y datos técnicos; editarla no modifica el modelo ni las otras unidades.

## Registro y edición

1. En el panel de planta, abre **Activos → Nuevo activo**. El mismo formulario está disponible en **Activos Físicos** de la web principal.
2. Busca el modelo por TAG, nombre o tipo y selecciónalo. Se precargan su nombre, especificaciones y componentes. También se sugiere su primera red habilitada en la planta.
3. Ajusta, agrega o elimina las filas según el equipo instalado. Completa nombre, etapa, red transversal y demás datos de la unidad.
4. Guarda. El TAG y el código FUR se generan automáticamente y la ficha técnica se almacena con el activo.

Al editar se muestran los datos guardados del activo. Cambiar el modelo de referencia conserva esa ficha. **Reemplazar ficha por la del modelo** carga expresamente la plantilla en el formulario; solo se guarda al confirmar los cambios. Al crear un activo, seleccionar otro modelo vuelve a precargar sus datos.

En las altas son obligatorias una **etapa** y una sola **Red transversal** habilitadas en la planta. La sugerencia de red del modelo puede cambiarse; si ninguna de sus redes está habilitada, hay que elegir otra antes de guardar. La API conserva `networkCodes` como lista, con un elemento para el alta. Los activos anteriores con varias redes las conservan hasta que se elige expresamente una sola o se quita la asignación.

## TAG automático y permanente

Formato: `RED-ETAPA-FAMILIA-CORRELATIVO`, por ejemplo `FUR-PROC-D01-MOT-001`. Se usa el código corto de la **familia**, no el del tipo o del modelo. Los [64 códigos de familia](codigos-familias-activos.md) se conservan en el seed base, manteniendo también sus códigos de integración y CA. Administración → Catálogo → Familias muestra ambos códigos y exige el código TAG al crear o editar. El código de integración se conserva; editar el código TAG cambia el prefijo de futuras altas, manteniendo el correlativo de la familia y los TAG de activos ya registrados.

El correlativo es independiente por **planta + red + etapa + familia**, empieza en `001`, no reinicia por año ni reutiliza números al dar de baja equipos. Después de `999` continúa `1000`. Se reserva dentro de la transacción del alta; las altas simultáneas no reciben el mismo TAG y un fallo de guardado revierte la reserva. Si se restauran activos con TAG del nuevo formato sin sus contadores, se continúa desde el mayor número existente de ese grupo.

El formulario muestra el TAG progresivo tanto en el input como en la cabecera: empieza en `XXX-XXX-XXX-001` y sustituye cada segmento al elegir modelo, red y etapa. Con los datos completos consulta el siguiente correlativo del grupo; esa consulta no reserva números. El número definitivo se asigna al guardar y podría variar si alguien registra otro activo del mismo grupo mientras el formulario está abierto. El cliente no puede elegir o cambiar el TAG. Los TAG existentes se conservan. Cambiar después la red, etapa, modelo o familia conserva el identificador asignado al alta, igual que el código FUR. La migración `0038_asset_generated_tags.sql` agrega códigos y contadores sin renombrar activos existentes.

Vaciar todas las especificaciones o todos los componentes es válido. Un vacío guardado no vuelve a heredar datos del catálogo. Las especificaciones tienen nombre y valor; sus nombres no deben repetirse. Los componentes son filas de texto independientes. Cada sección admite hasta 500 filas.

Las fichas del geoportal y de la FUR consultan la información propia del activo. La foto sigue siendo la del modelo; las variables generales y por red gestionadas en Catálogo → Variables conservan su funcionamiento como referencias del catálogo. Esta funcionalidad independiza las especificaciones y los componentes; no crea una BOM relacional de repuestos.

## Persistencia y API

- `asset.assets.asset_model_id` conserva el vínculo con el modelo de origen.
- `asset.assets.specifications` guarda las especificaciones de la unidad.
- `asset.assets.technical_data` guarda la copia inicial de los datos técnicos; los componentes están en `componentes`.
- `POST /api/v1/plants/:plantId/assets` acepta `specifications` y `components` opcionales. Si se omiten, copia los del modelo activo seleccionado; `{}` y `[]` son vacíos explícitos.
- El alta exige `stageCode` y un único código en `networkCodes`. `tag` es un dato de respuesta generado en el servidor; no se admite su modificación en `PATCH`.
- `GET /api/v1/plants/:plantId/assets/tag-preview?assetModelId=…&stageCode=D01&networkCode=FUR-PROC` devuelve `{ tag }` sin escrituras y requiere `asset.create` en esa planta. La respuesta no se almacena en caché HTTP.
- `PATCH /api/v1/plants/:plantId/assets/:assetId` reemplaza únicamente los datos técnicos enviados. Los componentes se cambian sin borrar las demás propiedades de `technical_data`.
- Las escrituras requieren los permisos de activos de esa planta y quedan auditadas.

Las modificaciones posteriores del catálogo no actualizan estas copias. Las altas futuras usan la versión del modelo que exista al registrarlas.

## Migración de activos existentes

`0037_asset_technical_snapshot.sql` agrega las columnas y copia la ficha que cada activo mostraba desde su modelo al momento de migrar. Conserva identidad, TAG, FUR, planta, redes, ubicación, metadatos e historial. No requiere reiniciar ni reimportar la base.

Al desplegar la API, el arranque aplica la migración pendiente. API y frontends deben desplegarse juntos para disponer del editor y del contrato actualizado.
