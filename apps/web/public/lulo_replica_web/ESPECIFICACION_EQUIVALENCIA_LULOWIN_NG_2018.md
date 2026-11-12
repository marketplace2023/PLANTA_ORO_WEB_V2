# Especificación para reproducir LuloWin NG 2018 en la web

## Mandato para el agente de implementación

El alcance es la **equivalencia funcional de LuloWin NG Control de Obras**, incluidos el módulo de Reportes y el módulo satélite LuloCronNG que viene en el paquete. Las tres etapas existentes organizan el desarrollo. El catálogo de equivalencia de este documento define qué funciones deben quedar cubiertas al terminar.

La matriz inicial reúne **146 fichas**, con 101 funciones, variantes y puntos de investigación, y las 45 opciones de reporte declaradas en el paquete 2018.

Reproduce las operaciones, sus variantes, los datos persistidos, los cálculos, las salidas y la posibilidad de intercambiar datos cuando corresponde. Para una operación propia de Windows, conserva la capacidad que recibe el usuario mediante un equivalente web y registra esa decisión. Por ejemplo, una base activa se representa como un espacio de trabajo con datos aislados. Un archivo de proyecto independizado sigue siendo un artefacto transportable. La compatibilidad con una base Access antigua requiere un adaptador y una prueba de reapertura, aparte del paquete portable web.

## Documentos que debe usar el agente

| Documento | Funciones que desarrolla |
| --- | --- |
| [Archivo, utilitarios y administración](equivalencia/01_ARCHIVO_UTILITARIOS_ADMINISTRACION.md) | Espacios de trabajo, intercambio y respaldo, actualización de catálogos, Excel, ajustes masivos, permisos, preferencias y ayuda. |
| [Maestros, proyectos y cálculo de presupuestos](equivalencia/02_MAESTROS_Y_PRESUPUESTOS.md) | Campos, búsquedas, copias, costo de equipos, mano de obra, FCAS, bonos, impuestos y APU. |
| [Ejecución, reajustes, cronograma y cierre](equivalencia/03_EJECUCION_REAJUSTES_Y_CIERRE.md) | Variaciones, cómputos, mediciones, valuaciones manuales y vinculadas, memorias, reajustes, LuloCronNG y cierre. |
| [Catálogo funcional de reportes](equivalencia/04_REPORTES.md) | Qué entrega cada reporte del paquete, a qué datos se conecta y cómo comprobarlo. |
| [Parámetros de reportes en JSON](equivalencia/reportes_2018.json) | Inventario extraído de MenuRep.xml con jerarquía, identificador, plantilla y parámetros declarados por cada reporte. |
| [Conciliación de la base y funciones por confirmar](equivalencia/05_CONCILIACION_BASE_Y_PENDIENTES_2018.md) | Cruce del esquema de datos con las funciones. Incluye operaciones administrativas detectadas por tablas y validaciones del cronograma. |
| [Matriz de seguimiento en JSON](equivalencia/matriz_equivalencia.json) | Índice por ID con significado, prueba, documento y estado inicial de verificación. |
| [Índice de las etapas](INDICE_IMPLEMENTACION_LULO_WEB.md) | Secuencia de entrega, guías del MVP y criterios para pasar de una etapa a la siguiente. |

## Fuentes y nivel de evidencia

1. [Manual de Usuario](Manual%20de%20Usuario.pdf), edición de 2012, 755 páginas en el PDF. Las referencias de las fichas usan página **impresa**. La posición correspondiente en el archivo PDF es la página impresa más uno.
2. Paquete local LWNG_2018. La base LULO.mdb confirma maestros, tablas de obra, copias de APU, variaciones, mediciones, valuaciones y cronograma. MenuRep.xml confirma los reportes y sus opciones en el paquete. El archivo INSUMOS.XLS sirve como muestra para estudiar importación. El paquete incluye LuloWinNG.exe, LuloCronNG.exe y LuloRepNG.exe.
3. Las fichas describen operaciones documentadas o identificadas en el paquete. Los controles web, estados, transacciones y reglas de seguridad son especificaciones de implementación propuestas. Cuando el manual no determina un resultado, la ficha indica qué comportamiento contrastar con el programa. La revisión del paquete se hizo leyendo sus archivos. La ejecución interactiva del programa y la comprobación con obras de referencia siguen pendientes.

## Cómo implementar y cerrar una ficha

1. Localiza el ID de la función y abre la referencia. Captura el menú, la pantalla principal, sus acciones, pestañas, opciones habilitadas o deshabilitadas y dependencias con el proyecto activo. Compara manual y versión 2018. Si la versión ejecutada agrega algo, crea una ficha nueva y conserva el rastro de la diferencia.
2. Escribe el caso principal y sus variantes. Incluye actores, precondiciones, entradas, validaciones, cambios de estado, salida y comportamiento cuando se cancela o falta un dato. Distingue datos calculados, datos configurables y valores asumidos.
3. Define el modelo, la operación de backend y la pantalla. Las escrituras usan autorización y contexto de organización/obra. Una importación, copia, recálculo, restauración o emisión usa una vista previa o confirmación acorde a su efecto y una operación atómica.
4. Prueba contra una referencia. Para operaciones numéricas, comparar componentes y no solo el total. Para reportes, comparar selección, parámetros, columnas, agrupación, importes y archivo exportado. Para intercambio, probar ida y vuelta y verificar qué campos se preservan.
5. Registra el resultado. Usa `INVENTARIADA`, `DETALLADA`, `IMPLEMENTADA`, `VERIFICADA_CON_LEGADO` o `EQUIVALENTE_WEB_APROBADO`. Una prueba propia acredita el comportamiento web. La paridad numérica o de formato requiere una evidencia del original o una equivalencia aprobada.

### Plantilla obligatoria de evidencia por función

| Campo | Contenido |
| --- | --- |
| ID y origen | Ficha, ruta de menú, versión observada y página, figura o identificador XML. |
| Preparación | Obra, versión, insumos, usuario, opciones y moneda. |
| Operación | Pasos en el original y pasos equivalentes en la web. |
| Comparación | Datos antes y después, valores por campo, diferencias justificadas y archivos de salida. |
| Casos alternos | Cancelación, datos inválidos, permisos, estado incompatible y reintento cuando aplique. |
| Estado | Resultado, evidencia, fecha y persona que valida. |

## Prioridad entre el MVP y la equivalencia

| Límite de la primera guía | Regla para cubrir el original |
| --- | --- |
| Un nivel de capítulos | Capítulos y subcapítulos, rangos, totales e incidencias. |
| Valuación basada en mediciones aprobadas | Incluir valuación manual sin medir y valuación que consume mediciones. Distinguir el origen de las cantidades. |
| Impuesto configurable al final del presupuesto | Implementar los seis modos documentados, sus bases y opciones de utilidad. |
| Un recargo FCAS y tarifa diaria de equipo | Incluir mano de obra directa e indirecta, bonos, gastos médicos, transporte y desglose de equipo según perfil. |
| Reconsideración centrada en índices | Incluir variación directa y por índices. Confirmar qué método usa cada variante. |
| CSV inicial | Incluir Excel con estructura de intercambio y los formatos de base requeridos. |
| Cronograma básico | Incluir Gantt, precedencias, calendarios, inversión, pagos y necesidades de insumos. Conciliar funciones adicionales con el módulo satélite. |
| Presupuesto y APU estándar | Implementar cada reporte del catálogo con sus parámetros y formato de salida. |

## Cierre de alcance

La entrega de equivalencia requiere recorrer el menú de las aplicaciones de 2018 con una instalación autorizada, conciliarlo contra estas fichas y guardar las evidencias. Deben quedar resueltos tres conjuntos: resultados de cálculo, compatibilidad de archivos y reportes, y funciones adicionales del cronograma o de ventanas subordinadas que el manual de 2012 no describa. Las fichas ya documentadas son la base de trabajo. El inventario puede ampliarse al validar el programa.

Para empezar, preparar una obra de referencia con partidas calculadas, manuales y asumidas, dos niveles de capítulos, los tres tipos de insumo, dos períodos, mediciones y valuación directa, aumento, disminución, obra extra, una reconsideración por cada método y cierre. Crear muestras separadas para los seis modos de IVA, costos de equipo y mano de obra, importaciones y reportes especiales. Usar una copia del catálogo y fijar fechas y precios para repetir los cálculos.
