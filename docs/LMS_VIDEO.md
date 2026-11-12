# Videos de las lecciones

El portal `planta_beneficio_oro_cursos` y el editor de cursos de la web principal usan la misma API, permisos y almacenamiento. No es necesario duplicar cursos entre portales.

## Uso

1. Entra como administrador o miembro de la organización que ofrece el curso.
2. Abre el curso y agrega o edita una lección. En **Origen del video**, elige **Subir archivo**, **Enlace externo** o **Sin video**.
3. Para archivos, selecciona MP4, MOV o WebM y guarda. La carga muestra su estado y permite cancelarla. Si falla, puedes reintentar sin crear otra lección. El límite predeterminado es 500 MB.
4. La API prepara el archivo en segundo plano. La duración se obtiene del video y se actualiza en la lección y en el total del curso. El listado actualiza su estado automáticamente y permite abrir una vista previa.
5. En la web principal, el alumno inscrito reproduce el video dentro de la lección. Se guarda la posición al reproducir, cada diez segundos, al pausar y al salir. Al volver a abrir una lección pendiente, continúa desde esa posición.
6. Al terminar, si el tiempo reproducido registrado llega al 90 %, se marca la lección como completada y se recalcula el avance con el sistema existente de certificados. Se conserva el botón de finalización manual para lecciones de texto y enlaces externos.

YouTube, Vimeo y enlaces directos a archivos o listas HLS/DASH se integran con ReactPlayer. Los enlaces de otros sitios se mantienen como enlaces externos. La inserción depende de los permisos que tenga el video en su proveedor. Los enlaces existentes siguen funcionando. La vista previa del instructor no registra avance de alumno.

## Servidor

- Ejecuta `npm install` en el repositorio principal y en el portal de cursos.
- Desde el repositorio principal, aplica `npm run db:migrate -w @fur/api` y arranca o reinicia la API. Las migraciones `0037_lesson_video.sql` y `0038_lesson_video_constraints.sql` agregan las tablas de medios y reproducción y alinean sus restricciones con Drizzle, sin modificar las lecciones existentes.
- FFmpeg y FFprobe se instalan como dependencias de la API. Opcionalmente, `FFMPEG_PATH` y `FFPROBE_PATH` pueden apuntar a ejecutables propios. El servidor necesita poder ejecutarlos y disponer de espacio temporal para la conversión.
- `MAX_VIDEO_UPLOAD_MB` configura el límite por video (500 por defecto, máximo 2048). Es independiente de `MAX_UPLOAD_MB`, que continúa aplicando a documentos. Ajusta también el límite y el tiempo de espera del proxy de producción para admitir esas cargas.
- Se reutiliza `STORAGE_DRIVER=local` o `s3`. Los archivos originales y preparados permanecen privados. Con disco local, la carpeta `STORAGE_DIR` debe persistir entre despliegues y ser compartida si hay varias instancias.
- La cola se guarda en PostgreSQL. Cada instancia procesa un trabajo a la vez y renueva una reserva mientras trabaja. Un trabajo abandonado se recupera después de un minuto. Los fallos aparecen en la lección y se resuelven subiendo de nuevo el archivo.
- La conversión produce un MP4 H.264/AAC, hasta 1080p y con inicio rápido. Este flujo ofrece reproducción progresiva y búsqueda por rangos HTTP; no genera varias calidades adaptativas.
- La reproducción de archivos exige una sesión autorizada. Los accesos temporales duran cuatro horas y el reproductor los renueva mientras está abierto. La API comprueba nuevamente la cuenta, el curso, la inscripción y el video vigente en cada solicitud. Sustituir o retirar el archivo invalida los accesos al anterior.
- El punto de reproducción se separa por alumno, lección y versión del video. El contador descarta saltos grandes incompatibles con el tiempo transcurrido; representa tiempo reproducido acumulado, no una comprobación única de cada segmento.

## Verificación

En el repositorio principal:

```powershell
npm run lint -w @fur/api
npm run test -w @fur/api -- --runInBand lesson-video.e2e.spec.ts video-tools.spec.ts lms.e2e.spec.ts
npm run test -w @fur/web -- src/pages/lms-pages.test.tsx src/components/lms/lesson-video.test.tsx src/components/lms/lesson-form-dialog.test.tsx src/lib/lesson-video.test.ts
npm run build -w @fur/web
```

En el portal de cursos: `npm run lint`, `npm test` y `npm run build`.

Las pruebas de integración generan y convierten un MP4 real en la base de pruebas, comprueban permisos, rangos, sustitución de archivos, recuperación de trabajos y progreso hasta la emisión del certificado.
