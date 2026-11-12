# Archivo, utilitarios y administración

[Volver a la especificación](../ESPECIFICACION_EQUIVALENCIA_LULOWIN_NG_2018.md)

Cada fila define una capacidad distinta. Los rangos corresponden a páginas impresas del manual. Cuando varias acciones usan el mismo servicio, mantener un criterio de aceptación para cada opción de menú.

## Archivo y espacios de trabajo

| ID y función | Significado y flujo | Regla de implementación y prueba |
| --- | --- | --- |
| AR01 Cambiar proyecto activo · 58–60 | El usuario localiza una obra y la convierte en el contexto de presupuesto, procesos y reportes. | Persistir la selección por usuario y espacio. Cambiar de obra refresca datos y permisos. Probar que editar desde una pestaña anterior conserva la obra del recurso y no aplica cambios a la recién seleccionada. |
| AR02 Resumen del presupuesto · 61–67 | Consulta factores, partidas, cantidades, PU e importes, original, IVA, aumentos, disminuciones, extras, modificado y valuado. | Construir una consulta de solo lectura con corte y versión. Diferenciar original, modificado y total valuado. Conciliar totales con presupuesto y valuaciones. |
| AR03 Cambiar compañía activa · 68 | Selecciona los datos de compañía usados al titular reportes. | Asociar la compañía autorizada al contexto de emisión. Probar que el cambio se refleja en un reporte nuevo y que una emisión histórica conserva su encabezado. Separar compañía emisora de cliente. |
| AR04 Abrir base o proyecto independizado · 69–72 | Abre otro conjunto de proyectos y partidas para trabajar en él. | Implementar apertura de paquete web o lectura autorizada de MDB mediante adaptador. Validar versión y alcance. Mostrar qué espacio se abrió y conservar la separación de datos. |
| AR05 Independizar proyecto · 73–78 | Exporta el proyecto activo y las partidas seleccionadas a una base independiente. | Construir un paquete con manifiesto, alcance y relaciones necesarias. Mostrar selección y dependencias antes de generar. Reabrirlo de forma autónoma y conciliar cantidades, precios, insumos y documentos incluidos. Si se exige salida MDB, probarla con LuloWin. |
| AR06 Incorporar independizado · 79–84 | Incorpora a la base activa un proyecto procedente de otro archivo. | Previsualizar altas, conflictos de códigos, IDs reasignados y datos dependientes. Confirmar en transacción. Probar la incorporación a un espacio con un proyecto del mismo código. |
| AR07 Realizar respaldo · 85–88 | Genera un ZIP de la base seleccionada. | Producir respaldo de alcance definido con versión y verificación de integridad. Incluir datos y referencias de archivos que correspondan al respaldo. Verificar que se pueda restaurar. |
| AR08 Recuperar respaldo · 89–92 | Recupera una base guardada en ZIP. | Examinar manifiesto y versión, validar rutas y contenido, y recuperar en un espacio de prueba antes de sustituir datos. Probar un respaldo válido, corrupto e incompatible. |
| AR09 Compactar base · 93–95 | Recupera espacio y mantiene índices de la base de escritorio. | Dar un equivalente operativo al administrador con resultado auditable. Separar mantenimiento web de compactación de MDB. Verificar que los datos y las relaciones se preserven. |
| AR10 Exportar a versiones anteriores · 96–98 | Produce una copia para las versiones de 2009 a 2011. El manual indica pérdida de estructuras propias de NG. | Especificar esquema por destino, transformar relaciones, emitir informe de campos y funciones sin representación y verificar apertura en la versión objetivo. Un Excel o ZIP web no acredita esta opción. |
| AR11 Crear base vacía · 99–102 | Inicia un conjunto de datos sin proyectos ni partidas. | Provisionar espacio vacío, establecer permisos y parámetros iniciales. Verificar que no hereda obras ni partidas de otro espacio. |
| AR12 Bases recientes · 103 | Acceso a las últimas diez bases usadas. | Mantener hasta diez espacios recientes por usuario. Filtrar los que perdieron autorización. |
| AR13 Salir · 104 | Cierra la operación del escritorio. | Ofrecer cierre de sesión web y advertencia sobre formularios pendientes. Probar que el acceso posterior requiere autenticación. |

## Utilitarios

| ID y función | Significado y flujo | Regla de implementación y prueba |
| --- | --- | --- |
| UT01 Recalcular PU de partidas · 682–686 | Cambia el precio referencial del maestro según factores, bonos y costos de insumos. | Elegir partidas y perfil, comparar PU anterior y nuevo, publicar revisiones. Distinguir este recálculo del de una obra. Verificar que un presupuesto con precios copiados conserva sus datos. |
| UT02 Actualizar partidas desde otra base · 687–693 | Selecciona origen y destino y copia o actualiza partidas y estructura de insumos. | Resolver equivalencias de códigos, unidades y relaciones. Mostrar altas, cambios y dependencias. Probar partida nueva, existente y con insumo faltante. |
| UT03 Actualizar insumos desde otra base · 694–698 | Selecciona materiales, equipos y mano de obra del origen, con actualización selectiva de precios. | Diferenciar alta, actualización de datos y actualización de costo. Registrar fuente y vigencia. Probar que desmarcar costo conserva el vigente. |
| UT04 Cambiar precios de insumos · 699–704 | Aplica factor o porcentaje al conjunto elegido. | Previsualizar por clase, familia, filtro o selección. Ejemplo propuesto: multiplicar 100 por 1,10 produce 110, mientras aumentar 10 % produce 110 por la fórmula porcentual. Validar otras operaciones, alcance y redondeo con el original. |
| UT05 Importar o actualizar insumos Excel · 705–710 | Carga las clases de insumo de un archivo compatible y actualiza coincidencias. | Contrastar columnas y hojas con INSUMOS.XLS. Validar tipos, códigos, unidades, monedas, fechas y qué columnas se pueden sobrescribir. Mostrar altas, cambios y errores por fila. Probar conservar costos al desactivar su actualización. |
| UT06 Exportar presupuesto Excel sin formato · 711 | Entrega datos del presupuesto activo para intercambio. | Generar los encabezados, tipos y orden que espera la importación compatible. Conservar códigos con ceros iniciales. Probar vuelta al importador y distinguir esta salida de un reporte Excel con formato. |
| UT07 Importar presupuesto Excel sin formato · 712–715 | Añade partidas al final del presupuesto. Un código existente puede recuperar el análisis. Un código nuevo se incorpora sin estructura de insumos. | Mostrar coincidencias y origen de PU. Conservar cantidad, unidad y valor del archivo según la opción acordada. Probar coincidencia, alta sin APU y archivo con duplicados. Confirmar en el legado cuándo crea también la partida maestra. |
| UT08 Encabezado Excel vacío · 716–718 | Crea un archivo con encabezados de importación listo para rellenar. | Generar una plantilla descargable a partir del mismo esquema que valida UT07. Probar rellenar e importar el archivo. Verificar nombres exactos en una muestra 2018. |
| UT09 Truncar decimales de PU · 719–720 | Elimina la fracción del PU en el alcance seleccionado. | Mostrar PU anterior y nuevo, recalcular importes y conservar criterio aplicado. Manual indica restricción si existen valuaciones. Verificar 12,99 → 12 y el caso bloqueado. |
| UT10 Redondear PU al entero próximo · 721 | Ajusta el precio al entero más próximo. | Previsualizar y contrastar el empate 12,50 con el original. Verificar los casos 12,49 y 12,51 y el total resultante. |
| UT11 Afectar rendimiento por factor · 722–723 | Cambia productividad y recalcula el análisis. | Aplicar operación y rango elegidos, mantener rendimiento positivo y recalcular componentes dependientes. Probar que al variar rendimiento cambian equipo y mano de obra, con material unitario estable cuando se mantiene su consumo. |
| UT12 Afectar PU por factor · 724 | Cambia el valor unitario de las partidas seleccionadas. | Mostrar si cambia el precio adoptado o el calculado y guardar el motivo. Contrastar alcance, opciones y efecto sobre precio asumido en el legado. |
| UT13 Afectar cantidades por factor o porcentaje · 725–726 | Modifica cantidades de un rango o presupuesto completo. | Mostrar base, operación y cantidad nueva. Recalcular importes y comprobar vigencias y documentos de ejecución asociados. Probar selección parcial y reintento. |
| UT14 Copiar valuaciones de otra base · 727–732 | Permite copiar desde una valuación inicial, copiar una sola o reemplazar las actuales por las del origen. | Validar correspondencia de código y número de partida. Revisar período, números y acumulados. Aplicar reemplazo en una copia revisable y con control de versión. Verificar cada modo y comparar historial y saldos. |

Para las cargas Excel, conservar los encabezados originales cuando se ofrece modo compatible y ofrecer un esquema web separado si se amplían campos. Las fórmulas de las celdas se tratan como datos del intercambio. Mostrar errores identificados por archivo, hoja, fila y campo. No publicar un lote parcialmente aplicado sin un resultado explícito por fila.

## Opciones, ayuda y acciones comunes

| ID y función | Significado y flujo | Regla de implementación y prueba |
| --- | --- | --- |
| OP01 Parámetros de cálculo · 733–734 | Configura distinción de labor directa/indirecta y desglose del costo de equipos. | Guardar perfil versionado. Probar con el mismo APU en modo simple y desglosado. |
| OP02 Preferencias visuales · 734–739 | Personaliza modo ventana/pantalla completa por módulo, estilo del menú, colores de tabla y fondo. | Persistir preferencias por usuario. Probar volver a abrir un módulo y restablecer las preferencias. |
| OP03 Datos de la empresa · 740–741 | Mantiene los datos de las compañías usados en reportes. | Validar datos y permisos. Verificar encabezados y firmantes según reporte. |
| OP04 Usuarios · 742–747 | Crea, modifica y elimina usuarios y controla niveles de autorización. | Mapear usuarios y permisos a la identidad web. Probar baja, permisos de lectura y edición, y autorización en servidor. |
| AY01 Índice y ayuda · 748 | Abre la documentación para consultar funciones. | Ofrecer acceso a ayuda y capítulos desde el módulo. Probar un enlace contextual por área. |
| AY02 Acerca de y activación · 748–749, 20–21 | Muestra identidad, versión, compilación y datos de soporte, y concentra la activación del escritorio. | Mostrar versión web y datos operativos autorizados. Si la web usa habilitación comercial, documentar su autorización y administración. La licencia del ejecutable se valida en el producto original. |
| AY03 Consejos al iniciar · 750 | Muestra recomendaciones y permite habilitar o deshabilitar su presentación. | Persistir la preferencia y presentar novedades de la versión correcta. |
| AY04 Actualización mensual · 751–754 | Descarga o recibe un paquete para actualizar la aplicación. | Adaptar a publicación web administrada con versiones, registro y recuperación. Si se desea consumir un archivo legado, distinguir actualizaciones de software de catálogos y verificar qué contiene antes de definir compatibilidad. |
| IN01 Instalación y configuración · 15–21 | Prepara el sistema para que un usuario pueda operar y acceder a sus datos. | Definir despliegue web, inicialización de espacio, datos iniciales, identidad y recuperación. Probar el alta de un espacio hasta abrir una obra. |
| UX01 Operaciones comunes de listados y fichas · 37–55 | Selección, búsqueda, orden, filtros, alta, edición, baja, guardar/cancelar y accesos desde menú y botones. | Implementar un patrón compartido sin duplicar la lógica de negocio. Verificar selección y navegación, cancelación sin cambios, y estados de edición y lectura. Confirmar atajos y acciones particulares de cada ficha en 2018. |
