# Autoría de cursos

Los cursos son independientes de las etapas de una planta. Se organizan por categoría y pueden ofrecerlos el ecosistema, un proveedor o un contratista con acceso habilitado.

## Portal del instructor

En `http://localhost:5178/courses`, **Nuevo curso** abre un espacio de trabajo completo, en lugar del formulario anterior. El curso nace como borrador y el editor tiene seis secciones:

1. **Presentación:** título, subtítulo, categoría, idioma, descripción, URL de portada y enlace opcional a un video de presentación.
2. **Aprendizaje:** resultados de aprendizaje, perfiles de participantes y requisitos previos. Cada lista permite hasta 30 elementos.
3. **Programa:** módulos con descripción; alta, edición, orden y eliminación de módulos vacíos; lecciones de texto o video; movimiento de lecciones entre módulos y vista previa. Los videos reutilizan la carga privada y el procesamiento descritos en [LMS_VIDEO.md](LMS_VIDEO.md).
4. **Instructor:** nombre, experiencia y nivel esperado del participante.
5. **Precio y certificado:** precio, moneda y emisión de certificado verificable. El precio continúa siendo informativo; no se ha añadido un sistema de pagos.
6. **Revisión y publicación:** vista previa de la ficha y comprobaciones del servidor. Los cambios deben guardarse antes de publicar.

**Guardar borrador** conserva la información sin publicar. **Guardar y continuar** guarda y abre la siguiente sección. Se avisa si intentas cerrar la pestaña con cambios sin guardar. Para volver a trabajar en un curso, usa **Editar curso** en el listado. El detalle del curso conserva el acceso al alumnado y sus avances.

La portada se puede subir desde el equipo (JPG, PNG o WebP de hasta 5 MB), enlazar mediante una URL directa pública o dejar vacía. Se guarda al guardar el curso y aparece en ambos portales. El servidor comprueba el contenido del archivo y los permisos de gestión; las portadas de borradores solo las puede consultar quien gestiona el curso. Al sustituir o eliminar una portada se retira el archivo anterior. Un enlace a una página de descarga puede devolver HTML o bloquear la imagen (403); el editor muestra un aviso y permite sustituirlo por un archivo. El video de presentación sigue siendo un enlace externo público; los archivos de las lecciones se cargan en su propio formulario y mantienen sus permisos de acceso.

## Publicación

### Perfil del instructor

En el portal de Cursos, **Mi perfil de instructor** (`/instructor`) permite guardar nombre público, especialidad, biografía y una foto JPG, PNG o WebP de hasta 5 MB. El perfil pertenece al usuario, independientemente de la organización que esté gestionando.

En un curso guardado, abre **Instructor → Vincular mi perfil**. La ficha pública utiliza los datos y la foto del perfil; los cambios posteriores se reflejan en los cursos vinculados. **Desvincular perfil** conserva el nombre y la biografía actuales como datos del curso. Los cursos anteriores mantienen su instructor escrito y no se vinculan automáticamente al administrador.

La migración `0041_instructor_profiles.sql` añade los perfiles y su referencia opcional desde los cursos. La API permite editar solo el perfil propio y exige permisos de gestión del curso para vincularlo. La foto es visible para su propietario y para quienes puedan consultar alguno de sus cursos vinculados.

La API exige título, descripción de al menos 80 caracteres, instructor, al menos un objetivo y un perfil de participante, una organización habilitada y un temario con contenido. Todas las lecciones deben contener texto, un enlace de video o un archivo de video que haya terminado de procesarse. La revisión informa exactamente lo que falta.

Los requisitos previos, la portada y el video de presentación son opcionales. No se exige ninguna etapa. Las comprobaciones se aplican al publicar o reactivar; los cursos publicados existentes no se ocultan durante esta migración.

## Web del ecosistema

La web principal usa los mismos campos y herramientas de autoría. El catálogo permite filtrar por categoría, nivel, proveedor de formación, duración, precio y certificado. La ficha muestra portada, subtítulo, objetivos, participantes, requisitos e instructor. El temario del alumno agrupa las lecciones por módulo.

Los enlaces antiguos que incluyen `stage` siguen abriendo el catálogo, pero ese parámetro ya no filtra cursos. Las asociaciones antiguas se conservan como historial en la base y no participan en la creación, edición, búsqueda ni publicación.

## Datos y despliegue

La migración `0039_course_authoring.sql` agrega los campos de presentación y aprendizaje, los módulos y la referencia de cada lección a su módulo. Las lecciones existentes se agrupan en **Contenido del curso** sin cambiar sus identificadores, orden, videos, inscripciones ni progreso. No se inventan objetivos ni requisitos para los cursos existentes.

`0040_course_cover_upload.sql` añade las referencias de almacenamiento de las portadas. Conserva las URLs existentes. `POST /courses/:id/cover` recibe el archivo en el campo `file`; `GET /courses/:id/cover` entrega los bytes respetando la visibilidad actual del curso. Las respuestas incluyen `coverSource` y `coverUrl` sin exponer las claves de almacenamiento.

Desde el repositorio principal:

```powershell
npm run db:migrate -w @fur/api
npm run build -w @fur/api
npm run build -w @fur/web
```

En el portal de cursos, ejecuta `npm run build`. Reinicia la API al desplegar. No hay dependencias nuevas para este cambio.

Pruebas de integración: `npm run test -w @fur/api -- --runInBand course-authoring.e2e.spec.ts lms.e2e.spec.ts lesson-video.e2e.spec.ts`. Cubren independencia de etapas, publicación, edición parcial, módulos de otros cursos, reordenación y conservación del avance del alumno.
