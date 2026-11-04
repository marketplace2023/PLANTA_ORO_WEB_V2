# Activos propios de planta

Cada activo pertenece a una planta y tiene familia, nombre, especificaciones y componentes propios. El catálogo se utiliza únicamente para referencias opcionales.

## Registro y edición

1. Selecciona la red transversal habilitada en la planta.
2. Selecciona la etapa.
3. Busca la familia por nombre, código de integración o código TAG.
4. Completa el nombre y los datos técnicos propios; comienzan vacíos.
5. Al final, añade opcionalmente modelos del catálogo de esa familia y etapa como referencia. Seleccionarlos no copia ningún dato al activo. Se pueden quitar individualmente; cambiar la familia o la etapa limpia las referencias del formulario.
6. Guarda. El TAG y el código FUR se asignan automáticamente. Los activos existentes conservan su TAG y su información técnica.

Las referencias se guardan por separado en asset.catalog_references. La migración 0040_independent_plant_assets.sql asigna la familia propia a los activos existentes y conserva su modelo anterior como referencia, sin alterar su identidad. El vínculo legado asset_model_id es opcional y se mantiene por compatibilidad; los registros del nuevo formulario no lo utilizan.

La API acepta familyId y referenceModelIds en el alta y la edición. Las referencias deben pertenecer a la familia del activo. Para la vista previa del TAG se envía familyId, stageCode y networkCode. Se conserva temporalmente la entrada antigua assetModelId para clientes anteriores.

## TAG automático y permanente

Formato: `RED-ETAPA-FAMILIA-CORRELATIVO`, por ejemplo `FUR-PROC-D01-MOT-001`. Se usa el código corto de la **familia**, no el del tipo o del modelo. Los [64 códigos de familia](codigos-familias-activos.md) se conservan en el seed base, manteniendo también sus códigos de integración y CA. Administración → Catálogo → Familias muestra ambos códigos y exige el código TAG al crear o editar. El código de integración se conserva; editar el código TAG cambia el prefijo de futuras altas, manteniendo el correlativo de la familia y los TAG de activos ya registrados.

El correlativo es independiente por **planta + red + etapa + familia**, empieza en `001`, no reinicia por año ni reutiliza números al dar de baja equipos. Después de `999` continúa `1000`. Se reserva dentro de la transacción del alta; las altas simultáneas no reciben el mismo TAG y un fallo de guardado revierte la reserva. Si se restauran activos con TAG del nuevo formato sin sus contadores, se continúa desde el mayor número existente de ese grupo.

El formulario muestra el TAG progresivo tanto en el input como en la cabecera: empieza en `XXX-XXX-XXX-001` y sustituye cada segmento al elegir familia, red y etapa. Con los datos completos consulta el siguiente correlativo del grupo; esa consulta no reserva números. El número definitivo se asigna al guardar y podría variar si alguien registra otro activo del mismo grupo mientras el formulario está abierto. El cliente no puede elegir o cambiar el TAG. Los TAG existentes se conservan. Cambiar después la red, etapa, modelo o familia conserva el identificador asignado al alta, igual que el código FUR. La migración `0038_asset_generated_tags.sql` agrega códigos y contadores sin renombrar activos existentes.

Vaciar todas las especificaciones o todos los componentes es válido. Un vacío guardado no vuelve a heredar datos del catálogo. Las especificaciones tienen nombre y valor; sus nombres no deben repetirse. Los componentes son filas de texto independientes. Cada sección admite hasta 500 filas.

Las fichas del geoportal y de la FUR consultan la información propia del activo. Los activos antiguos conservan la foto de su modelo legado; los nuevos muestran el estado sin imagen. Añadir referencias no copia sus imágenes ni variables. Las variables generales y por red gestionadas en Catálogo → Variables mantienen su funcionamiento en el catálogo. Esta funcionalidad no crea una BOM relacional de repuestos.

## Persistencia y API

- `asset.assets.family_id` identifica la familia propia; `asset_model_id` es un vínculo legado opcional.
- `asset.assets.specifications` guarda las especificaciones de la unidad.
- `asset.assets.technical_data` guarda los datos técnicos propios; los componentes están en `componentes`.
- `POST /api/v1/plants/:plantId/assets` acepta `specifications` y `components` opcionales. En el flujo por familia, si se omiten se guardan vacíos; `{}` y `[]` son vacíos explícitos.
- El alta exige `stageCode` y un único código en `networkCodes`. `tag` es un dato de respuesta generado en el servidor; no se admite su modificación en `PATCH`.
- `GET /api/v1/plants/:plantId/assets/tag-preview?familyId=…&stageCode=D01&networkCode=FUR-PROC` devuelve `{ tag }` sin escrituras y requiere `asset.create` en esa planta. La respuesta no se almacena en caché HTTP.
- `PATCH /api/v1/plants/:plantId/assets/:assetId` reemplaza únicamente los datos técnicos enviados. Los componentes se cambian sin borrar las demás propiedades de `technical_data`.
- Las escrituras requieren los permisos de activos de esa planta y quedan auditadas.

Las modificaciones del catálogo no alteran los datos propios del activo. Las referencias solo relacionan modelos del catálogo, sin heredar sus valores.

## Migración de activos existentes

`0037_asset_technical_snapshot.sql` agrega las columnas y copia la ficha que cada activo mostraba desde su modelo al momento de migrar. Conserva identidad, TAG, FUR, planta, redes, ubicación, metadatos e historial. No requiere reiniciar ni reimportar la base.

Al desplegar la API, el arranque aplica la migración pendiente. API y frontends deben desplegarse juntos para disponer del editor y del contrato actualizado.
