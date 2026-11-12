# Contratación de servicios profesionales

El directorio profesional incorpora un flujo comercial independiente del catálogo técnico, de los productos del marketplace y de los cursos. Las empresas y sus servicios anteriores se conservan. Cada servicio necesita completar su oferta comercial y publicarse desde el portal profesional para aparecer en el nuevo directorio.

## Dónde se usa

- Portal profesional, puerto 5179: resumen, servicios, editor por pasos, trabajos y solicitudes, perfil profesional, perfil legal de empresa y equipo.
- Web principal: `/professionals`, `/professionals/:id`, `/service-orders` y `/service-orders/:id`.
- Administrador: `/professional-cases`, con conversación, condiciones y resolución de incidencias.

## Preparar una oferta

1. Registrar una empresa y esperar su aprobación administrativa, como antes.
2. Completar Perfil profesional: nombre, titular, biografía, idiomas, habilidades, foto y portafolio. Los datos legales siguen en Perfil de empresa.
3. Guardar los datos bancarios desde la sección dedicada del perfil. Editar la biografía nunca sustituye la cuenta bancaria.
4. Crear un servicio en borrador. Definir de uno a tres paquetes, moneda, plazo, revisiones y entregables. Elegir contratación por paquete o presupuesto personalizado.
5. Añadir extras, requisitos obligatorios, preguntas frecuentes y condiciones. Las etapas son una clasificación opcional.
6. Guardar el borrador, subir al menos una imagen y publicar. Se exige una descripción de 80 caracteres y datos bancarios para paquetes de pago con contratación directa.

Máximos: tres paquetes, diez extras, veinte requisitos, diez preguntas frecuentes, ocho imágenes por servicio. Perfil: una foto, doce imágenes de portafolio y doce proyectos con enlaces HTTPS. Imágenes JPG, PNG o WebP, hasta 5 MB, validadas por contenido.

## Contratación

Por paquete: el cliente elige paquete y extras, completa los requisitos y confirma el precio mostrado. Se crea la contratación con una copia de la oferta, condiciones, precio y datos bancarios. El profesional puede recibir también solicitudes personalizadas aunque ofrezca paquetes.

Por presupuesto: solicitud → propuesta → aceptación → requisitos → transferencia → confirmación del profesional → ejecución → entrega → aprobación. El cliente puede solicitar cambios antes de aceptar. Las propuestas vencidas no se pueden aceptar.

La propuesta define alcance, moneda, precio total, plazo, entregables, revisiones y hasta cinco hitos opcionales. Cada hito se entrega y aprueba por separado. El pago por transferencia cubre el importe total; los hitos no generan cobros parciales ni liberaciones automáticas de fondos.

El plazo comienza después de la confirmación manual del pago. En trabajos gratuitos comienza al confirmar los requisitos. La ampliación del plazo requiere aprobación de la otra parte. Las revisiones se cuentan sobre el total del trabajo y nunca pueden superar las incluidas.

Cada expediente dispone de conversación, archivos privados, entregas formales e historial de eventos. Se admiten PDF, JPG, PNG, WebP, TXT, CSV, DOCX y XLSX de hasta 5 MB por archivo. Los adjuntos requieren autorización; las imágenes públicas solo se sirven para empresas activas y servicios publicados.

## Pagos y cancelaciones

El cliente paga directamente a la cuenta bancaria del profesional. Informa la referencia y puede adjuntar el comprobante en la conversación. El responsable financiero verifica su banco y confirma o rechaza el pago. La aplicación no consulta bancos, no cobra tarjetas, no custodia fondos y no presenta los ingresos como una cartera retirable.

Antes de informar un pago, el cliente puede cancelar la solicitud. Después puede solicitar una cancelación que debe aceptar la otra parte. Si hay un pago informado o confirmado, la cancelación pasa a reembolso pendiente. Finanzas registra el reembolso únicamente tras realizarlo e introducir su referencia bancaria.

Cliente y profesional pueden abrir una incidencia. La mediación bloquea las transiciones normales. Solo el administrador global puede resolverla: reanudar, dar por completado un trabajo con pago confirmado o requerir un reembolso. La aplicación registra la decisión; no ejecuta movimientos bancarios.

## Reseñas y métricas

Solo el cliente de un trabajo completado puede publicar una reseña; hay una por contratación. El profesional puede responder. Las estrellas del nuevo directorio se calculan desde estas reseñas, sin usar la calificación administrativa histórica. Al añadir una reseña también se actualiza el promedio de la empresa para las vistas anteriores.

El resumen muestra solicitudes, trabajos activos, entregas por aprobar, completados, vencimientos, pagos por revisar, mediaciones, reseñas e importes brutos agrupados por moneda. No suma monedas diferentes.

## Permisos

Responsables y administradores tienen acceso completo. Los miembros se pueden limitar a Servicios y perfil, Gestión de trabajos, Finanzas o Solo lectura. Los miembros anteriores conservan acceso completo hasta que el responsable les asigne un ámbito. Los permisos se comprueban en la API, incluidos los endpoints anteriores de perfil y servicios. Solo responsables/administradores pueden asignar ámbitos o modificar el equipo.

## Persistencia y concurrencia

Migración: `0045_professional_commerce`, añadida sin modificar las tablas comerciales anteriores. Se mantienen en `professional` las ofertas, configuración, imágenes, contrataciones, mensajes, eventos, reseñas, notificaciones y permisos del equipo.

Cada solicitud lleva una clave de idempotencia y una huella del contenido: un reintento devuelve la misma contratación; reutilizar la clave con otro contenido se rechaza. Las escrituras de contrataciones bloquean la fila y exigen su versión actual. La oferta también usa versión para impedir aceptar precios o sobrescribir ediciones antiguas. Los archivos usan claves generadas en el servidor y se limpian al fallar una escritura.

API: `/contractors/:id/workspace/*` para gestión, `/professional-market/services/*` para ofertas, `/professional-market/orders/*` para trabajos y `/professional-market/admin/cases` para mediación. Las notificaciones internas se consultan cada 30 segundos; no envían correos ni mensajes externos.

## Validación

`npm run test -w @fur/api -- professional-commerce.e2e.spec.ts organizations.e2e.spec.ts --runInBand`

Las pruebas usan exclusivamente `fur_test`, con empresas y usuarios E2E que se eliminan al finalizar. Se comprueban publicación, permisos nuevos y anteriores, imágenes, versiones, idempotencia, precios, requisitos, pagos, entregas privadas, límites de revisiones, hitos, reseñas, cancelaciones, reembolsos, mediación y limpieza de archivos.

Los componentes de contratación se comparten por copia entre los repositorios independientes: `lib/professional.ts`, `components/service-order-workspace.tsx`, `components/service-orders-list.tsx` y `styles/professional.css`. Mantener las tres copias sincronizadas al cambiar el contrato de la API.
