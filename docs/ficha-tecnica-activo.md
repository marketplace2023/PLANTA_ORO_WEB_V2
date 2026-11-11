# Activos propios de planta

El activo de planta representa una unidad física y debe tener un único modelo de origen del catálogo. Ese vínculo no mezcla sus datos: las especificaciones y los componentes de planta se guardan por separado y nunca modifican el modelo global.

## Registro desde planta

1. Selecciona red transversal, etapa y familia.
2. Selecciona el modelo de origen, inmediatamente después de Familia. Solo se ofrecen modelos activos de esa familia, etapa y red. La API vuelve a validar la selección.
3. Al seleccionar un modelo en el alta, se copian sus especificaciones y componentes como datos iniciales editables de la unidad; el nombre se sugiere si estaba vacío. Elegir otro modelo reemplaza esa precarga, incluso si el nuevo tiene la ficha vacía. Volver a elegir el mismo modelo conserva las modificaciones realizadas. Los valores se guardan por separado y no alteran el catálogo. La edición de un activo existente conserva su ficha propia.
4. Guarda: el servidor asigna TAG y FUR definitivos.

No se admiten altas sin `assetModelId` ni listas de referencias. Las referencias múltiples históricas no se convierten en un origen arbitrario. La migración 0045 recupera el origen cuando había una única referencia; las unidades anteriores aún incompletas siguen consultables y deben seleccionar su modelo al editarse.

## Si el equipo no existe en catálogo

En el formulario, marca «No existe en el catálogo: solicitar incorporación». Completa la ficha y envíala. `POST /plants/:plantId/catalog-requests` requiere `asset.create`, valida la familia, etapa, red y especificaciones y guarda la solicitud pendiente. No crea una unidad ni reserva TAG/FUR. `GET` en esa ruta permite consultar las solicitudes y decisiones de esa planta.

La planta puede añadir una «Nota de la solicitud» opcional de hasta 5.000 caracteres para explicar sus motivos. La API recorta espacios exteriores y la conserva como `draft.requestNote`, incluidos los saltos de línea. Se muestra en la ficha de solicitud de planta y en el detalle de administración, tanto pendiente como resuelta. Las solicitudes anteriores sin nota siguen siendo válidas. La nota se conserva durante la revisión y la decisión, separada de `decisionNote`, y no se copia al modelo del catálogo ni al activo aprobado.

En Planta → Solicitudes, las rechazadas ofrecen «Crear nueva solicitud» en el listado y en su ficha. Se abre un formulario independiente con clasificación, nombre, serie, estado, criticidad, visibilidad, especificaciones, componentes y nota precargados. El motivo del rechazo se muestra como contexto; la planta puede corregir los datos y ampliar la nota. Cancelar no guarda cambios. Enviar crea otro registro pendiente, sin reutilizar el modelo de revisión ni el TAG de la solicitud anterior. `draft.sourceRequestId` conserva el vínculo con la rechazada de origen: la API exige que exista, esté rechazada y pertenezca a la misma planta. La solicitud original y su decisión no se modifican.

Administración → Catálogo → Solicitudes de plantas muestra las fichas recibidas. El administrador selecciona un tipo de la familia, ajusta nombre, especificaciones y componentes del modelo y agrega su imagen. No hace falta habilitar previamente la etapa en el tipo. «Guardar ficha de catálogo» crea o actualiza un modelo inactivo con la etapa y red solicitadas, todavía no ofrecido a la planta; no amplía las etapas del tipo. La ficha de planta recibida permanece independiente.

Al aprobar, se añade automáticamente la asociación tipo–etapa que falte, conservando las demás etapas del tipo, y se garantizan las asociaciones modelo–etapa y modelo–red. Estas asociaciones se confirman junto con la publicación del modelo y el alta de planta. Rechazar o una aprobación fallida no amplía las etapas del tipo. El alta ordinaria de modelos sigue validando sus etapas contra las del tipo.

La aprobación publica el modelo y crea la unidad con la ficha original de planta en una sola transacción. Si falla una validación, no se publica ni se registra parcialmente. La solicitud se bloquea durante la decisión: dos aprobaciones simultáneas no crean dos activos. El TAG/FUR se asigna en ese momento, no al enviar la solicitud. El rechazo exige un motivo y no crea activos; el modelo de revisión, si existía, permanece inactivo. La planta puede consultar el estado y el comentario desde su formulario de alta.

`GET /catalog/requests`, `PATCH /catalog/requests/:id`, `POST /catalog/requests/:id/approve` y `POST /catalog/requests/:id/reject` exigen administración global. Las decisiones y las revisiones quedan auditadas.

## TAG automático y permanente

Formato: `RED-ETAPA-FAMILIA-CORRELATIVO`, por ejemplo `FUR-PROC-D01-MOT-001`. Se usa el código corto de la **familia**, no el del tipo o del modelo. Los [81 códigos de familia](codigos-familias-activos.md) se conservan en el seed base, manteniendo también sus códigos de integración y CA. Administración → Catálogo → Familias muestra ambos códigos y exige el código TAG al crear o editar. El código de integración se conserva; editar el código TAG cambia el prefijo de futuras altas, manteniendo el correlativo de la familia y los TAG de activos ya registrados.

El correlativo es independiente por **planta + red + etapa + familia**, empieza en `001`, no reinicia por año ni reutiliza números al dar de baja equipos. Después de `999` continúa `1000`. Se reserva dentro de la transacción del alta; las altas simultáneas no reciben el mismo TAG y un fallo de guardado revierte la reserva. Si se restauran activos con TAG del nuevo formato sin sus contadores, se continúa desde el mayor número existente de ese grupo.

El formulario muestra el TAG progresivo tanto en el input como en la cabecera: empieza en `XXX-XXX-XXX-001` y sustituye cada segmento al elegir familia, red y etapa. Con los datos completos consulta el siguiente correlativo del grupo; esa consulta no reserva números. El número definitivo se asigna al guardar y podría variar si alguien registra otro activo del mismo grupo mientras el formulario está abierto. El cliente no puede elegir o cambiar el TAG. Los TAG existentes se conservan. Cambiar después la red, etapa, modelo o familia conserva el identificador asignado al alta, igual que el código FUR. La migración `0038_asset_generated_tags.sql` agrega códigos y contadores sin renombrar activos existentes.

Los componentes pueden vaciarse; las especificaciones se rigen por la obligatoriedad del maestro de su familia. Un vacío guardado no vuelve a heredar datos del catálogo. Los componentes son filas de texto independientes y admiten hasta 500 filas.

Las fichas del geoportal y de la FUR consultan la información propia del activo. La imagen mostrada corresponde al modelo de origen. Las imágenes y variables del catálogo no se copian sobre los datos propios de la unidad. Las variables generales y por red gestionadas en Catálogo → Variables mantienen su funcionamiento en el catálogo. Esta funcionalidad no crea una BOM relacional de repuestos.

## Persistencia y API

- `asset.assets.family_id` identifica la familia propia; `asset_model_id` identifica el único modelo de origen y es obligatorio para las nuevas altas.
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

## Maestro de especificaciones por familia

Administración → Catálogo de activos → Especificaciones mantiene los parámetros permitidos de cada familia: nombre, unidad, tipo, obligatoriedad y orden. No tienen alcance por red, etapa o tipo de activo. Catálogo y planta usan las mismas definiciones; sus valores se guardan por separado en cada modelo o activo.

La fuente vigente es `Parametros_registro_activos_por_familia_completo.xlsx` (09/11/2026), conservada en `apps/api/test/fixtures/family-specifications-completo.xlsx`. Su SHA-256 es `9d55804fcd83769e3a1939bbea16108a2eaaee1a30dc1a5c73ec51035c55e98b`. Define 84 familias y 897 especificaciones (474 obligatorias y 423 opcionales). Instrumentación tiene 40 parámetros y Equipos de laboratorio 31; Clarificadores, Estructuras y Plataformas y pasarelas tienen 12 cada una (6 obligatorias y 6 opcionales); las otras 79 tienen 10. Las 790 definiciones numéricas, 79 rangos y 28 textos se registran como `TEXT` según la política vigente. Se conservan los 861 IDs anteriores. La migración 0049 añade las 36 definiciones nuevas sin modificar ediciones administrativas ni datos de modelos o activos. El fixture anterior y las migraciones previas se conservan como historial.

La migración 0048 actualiza el maestro: asigna códigos de integración N4_68–N4_84 y CA 68–84 a las 17 familias antes identificadas como FAM_<TAG>, conserva sus UUID y relaciones y añade las tres familias nuevas. Sustituye las definiciones por las del Excel, conservando los IDs de los parámetros que siguen existiendo. No modifica valores de modelos ni activos, ni familias creadas manualmente fuera de este maestro. Las migraciones anteriores se conservan como historial.

Después de un reset, las migraciones y el seed restauran el maestro vigente. Repetir el seed no sobrescribe ediciones posteriores de administración. Las pruebas comparan todas las familias y definiciones del Excel contra los seeders, incluidos códigos de integración, CA, TAG, unidades, obligatoriedad y orden.

Al seleccionar familia se muestran sus campos; se escriben valores, no nombres. Los tipos admitidos son texto, número, sí/no, lista de textos y rango con mínimo y/o máximo. Cero y No son valores válidos. Las altas nuevas exigen los parámetros obligatorios. En registros anteriores se permiten campos obligatorios que ya faltaban para facilitar completar la ficha gradualmente; un obligatorio que ya tenía valor no puede vaciarse. Los datos anteriores fuera del maestro se conservan, pero no se muestran en el editor de activos de planta ni se editan como texto libre. La ficha del selector permite consultar todos los datos del modelo de catálogo.

`GET /catalog/specifications?familyId=UUID` es público. `POST /catalog/specifications`, `PATCH /catalog/specifications/:id` y `DELETE /catalog/specifications/:id` requieren administración global y quedan auditados. La familia de una definición es permanente. El nombre y unidad determinan la clave de almacenamiento `Nombre (unidad)`; si tiene valores guardados se protegen nombre, unidad y tipo, y no se permite eliminarla. Su obligatoriedad y orden pueden editarse.

La API valida tanto modelos como activos. El importador masivo valida las mismas definiciones y muestra los errores por fila antes de guardar. Las opciones para admitir modelos duplicados o fichas sin especificaciones no permiten saltar errores del maestro. Una familia nueva debe definirse en administración antes de importar especificaciones. Excel admite números con coma decimal, sí/no, listas separadas por punto y coma y rangos JSON o como `10–20`, `≤ 20`, `≥ 10`.

## Conversión de especificaciones numéricas a texto

La migración 0046 cambia a `TEXT` todas las definiciones de especificaciones que estaban en `NUMBER`, incluidas las creadas manualmente. Convierte a cadenas los valores JSON numéricos de esos parámetros en modelos, activos, valores predeterminados de tipos y solicitudes pendientes de catálogo. Mantiene nombres, unidades, obligatoriedad, orden, IDs y valores (incluido cero); no modifica rangos, listas, sí/no, valores vacíos ni parámetros fuera del maestro.

El seed vigente contiene 897 textos para las 84 familias. La prueba del Excel aplica explícitamente esta decisión posterior sin alterar el archivo fuente original. Las variables del catálogo son otro maestro y conservan sus tipos. Los formularios y el importador usan las definiciones actualizadas automáticamente; estos parámetros aceptan texto como `≈ 16` o `85–264`.

La migración 0047 convierte también las definiciones `RANGE` a `TEXT`, incluidas las manuales. Los valores estructurados se conservan como texto legible: `10–20`, `≥ 10` o `≤ 20`. Se actualizan modelos, activos, valores predeterminados de tipos y solicitudes pendientes. Los textos y nulos existentes se mantienen; cualquier estructura histórica distinta se conserva como JSON textual. Las variables de tipo rango del otro maestro no cambian.
