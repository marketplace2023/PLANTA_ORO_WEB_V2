# Ficha técnica propia de cada activo físico

El catálogo global proporciona la plantilla. Cada unidad de una planta conserva su propia copia de especificaciones y datos técnicos; editarla no modifica el modelo ni las otras unidades.

## Registro y edición

1. En el panel de planta, abre **Activos → Nuevo activo**. El mismo formulario está disponible en **Activos Físicos** de la web principal.
2. Busca el modelo por TAG, nombre o tipo y selecciónalo. Se precargan su nombre, especificaciones y componentes. También se sugiere su primera red habilitada en la planta.
3. Ajusta, agrega o elimina las filas según el equipo instalado. Completa TAG, nombre, etapa, redes y demás datos de la unidad.
4. Guarda. El código FUR se genera automáticamente y la ficha técnica se almacena con el activo.

Al editar se muestran los datos guardados del activo. Cambiar el modelo de referencia conserva esa ficha. **Reemplazar ficha por la del modelo** carga expresamente la plantilla en el formulario; solo se guarda al confirmar los cambios. Al crear un activo, seleccionar otro modelo vuelve a precargar sus datos.

El formulario permite seleccionar una sola **Red transversal**, o dejarla sin asignar. La sugerencia del modelo puede cambiarse; si ninguna de sus redes está habilitada en la planta, no se preselecciona ninguna. La API conserva el contrato `networkCodes` como lista. Los activos anteriores con varias redes las conservan hasta que se elige expresamente una sola o se quita la asignación.

Vaciar todas las especificaciones o todos los componentes es válido. Un vacío guardado no vuelve a heredar datos del catálogo. Las especificaciones tienen nombre y valor; sus nombres no deben repetirse. Los componentes son filas de texto independientes. Cada sección admite hasta 500 filas.

Las fichas del geoportal y de la FUR consultan la información propia del activo. La foto sigue siendo la del modelo; las variables generales y por red gestionadas en Catálogo → Variables conservan su funcionamiento como referencias del catálogo. Esta funcionalidad independiza las especificaciones y los componentes; no crea una BOM relacional de repuestos.

## Persistencia y API

- `asset.assets.asset_model_id` conserva el vínculo con el modelo de origen.
- `asset.assets.specifications` guarda las especificaciones de la unidad.
- `asset.assets.technical_data` guarda la copia inicial de los datos técnicos; los componentes están en `componentes`.
- `POST /api/v1/plants/:plantId/assets` acepta `specifications` y `components` opcionales. Si se omiten, copia los del modelo activo seleccionado; `{}` y `[]` son vacíos explícitos.
- `PATCH /api/v1/plants/:plantId/assets/:assetId` reemplaza únicamente los datos técnicos enviados. Los componentes se cambian sin borrar las demás propiedades de `technical_data`.
- Las escrituras requieren los permisos de activos de esa planta y quedan auditadas.

Las modificaciones posteriores del catálogo no actualizan estas copias. Las altas futuras usan la versión del modelo que exista al registrarlas.

## Migración de activos existentes

`0037_asset_technical_snapshot.sql` agrega las columnas y copia la ficha que cada activo mostraba desde su modelo al momento de migrar. Conserva identidad, TAG, FUR, planta, redes, ubicación, metadatos e historial. No requiere reiniciar ni reimportar la base.

Al desplegar la API, el arranque aplica la migración pendiente. API y frontends deben desplegarse juntos para disponer del editor y del contrato actualizado.
