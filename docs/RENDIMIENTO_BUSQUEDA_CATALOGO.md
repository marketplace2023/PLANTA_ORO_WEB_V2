# Optimización de búsqueda del catálogo — 13/11/2026

**Diagnóstico: la búsqueda resulta usable y fluida con el catálogo y la carga local medidos.** No constituye una prueba de AWS ni una garantía para más datos o concurrencia.

## Método comparable

- Misma máquina (i7-3770, 8 CPU lógicas, 16 GiB), PostgreSQL 17.10 y API en desarrollo.
- 689 modelos activos, 15.296 especificaciones, página de 24; datos de negocio conservados.
- Caché caliente; 10 consultas, 20 repeticiones secuenciales por consulta y otras 150 solicitudes con 5 simultáneas: 350 solicitudes medidas por versión, sin errores.
- Las pruebas funcionales y la medición SQL de escritura terminaron antes de medir la búsqueda final. No se ejecutaron pruebas de aplicación en paralelo con esa medición final.
- Se toma como comparación el commit 170e000 y su medición anterior. La optimización se mide en el árbol de trabajo actual. Los primeros resultados exploratorios de optimización fueron reemplazados por la repetición final aislada.
- p95 muestral: el 95 % de las muestras responde antes de ese tiempo; 20 muestras por caso sin carga y 15 por caso en la mezcla concurrente. No incluye el debounce de 300 ms ni renderizado del navegador.

## Resultados HTTP

| Consulta | Coincidencias | p95 anterior | p95 optimizado | p95 anterior, 5 simultáneas | p95 optimizado, 5 simultáneas |
|---|---:|---:|---:|---:|---:|
| Sin búsqueda | 689 | 15 ms | 21 ms | 28 ms | 70 ms |
| camara | 205 | 608 ms | 66 ms | 1500 ms | 296 ms |
| motor | 46 | 546 ms | 22 ms | 1372 ms | 225 ms |
| acero inoxidable | 20 | 552 ms | 27 ms | 1523 ms | 258 ms |
| camara 25W | 3 | 202 ms | 16 ms | 596 ms | 232 ms |
| motor 5hp | 0 | 191 ms | 17 ms | 585 ms | 502 ms |
| Sin coincidencias | 0 | 551 ms | 15 ms | 1379 ms | 70 ms |
| Consulta larga | 0 | 204 ms | 41 ms | 613 ms | 142 ms |
| camara + etapa/red | 10 | 22 ms | 28 ms | 33 ms | 112 ms |
| camara · página 4 | 205 | 608 ms | 66 ms | 1473 ms | 162 ms |

La mezcla concurrente pasó de 1374 ms a 152 ms al p95 (89.0 % menos). Su máximo fue 502 ms; 0 errores. El caudal de esta mezcla pasó de 6.47 a 76.64 solicitudes/s; no equivale a usuarios soportados.

No todos los casos mejoran: la consulta sin texto y la muy filtrada añaden algunos milisegundos en esta muestra, y hay dispersión bajo concurrencia. Ambas siguen siendo rápidas. La mayor mejora está en búsquedas globales y de especificaciones. Los resultados con 0 coincidencias (incluido motor 5hp en estos datos) se identifican expresamente; camara 25W sí devuelve 3 modelos.

Con el debounce actual, «camara» queda aproximadamente en 366 ms desde la última tecla hasta recibir respuesta al p95 secuencial, frente a 908 ms antes; con la carga medida, unos 596 ms frente a 1.800 ms. Estas sumas son orientativas, no percentiles medidos del navegador.

## Qué cambió

- Documento de búsqueda y vector español ponderado persistidos en catalog.model_search_documents. GIN para el vector y para ILIKE mediante pg_trgm.
- Cantidades/unidades extraídas una vez al escribir y almacenadas en catalog.model_search_quantities, con índice B-tree por unidad, cantidad y modelo.
- Triggers mantienen las proyecciones en altas, ediciones, cambios de tipo/familia y borrados. Los originales siguen en sus tablas habituales; no se han reemplazado valores de especificaciones por texto de búsqueda.
- Ya no se recorren y normalizan los JSON de todas las fichas al buscar. EXPLAIN muestra uso de los dos GIN en «motor» y del índice de cantidades en «camara 25W».
- Para «camara» PostgreSQL todavía elige recorrer los documentos preparados por ser una consulta amplia; aun así, la lista bajó de unos 530 a 34 ms de ejecución SQL. Para «camara 25W», la lista ejecuta en unos 1,1 ms y el total en 0,6 ms. Son ejecuciones SQL explicadas por separado, no latencia HTTP sumada.
- Se conservan dos consultas para lista y total: ahora comparten proyecciones/indexación persistida, no un único conjunto materializado por petición. No fue necesario reestructurar la respuesta ni la paginación para obtener la mejora.

## Impacto en registro e importación

**No cambia el flujo visible ni el formato:** mismos formularios, campos, plantilla Excel, permisos, validaciones, aprobación de solicitudes y paginación. No hay un paso adicional de indexación ni una cola: la ficha queda buscable al finalizar su transacción.

Sí añade trabajo al guardar, a cambio de abaratar las lecturas. Medición SQL exploratoria en fur_test con 22 especificaciones por modelo, referencias y comprobaciones diferidas ejecutadas; siete repeticiones útiles alternando con/sin el trigger de proyección, mediana. Cada prueba termina con rollback. El control sin proyección conserva los demás triggers y el bloqueo asesor, por lo que aísla principalmente el costo de preparar los documentos y cantidades.

| Registros en lote | Sin preparar índice | Con índice | Diferencia |
|---|---:|---:|---:|
| 100 | 0.095 s | 0.327 s | +0.232 s |
| 500 | 0.753 s | 2.620 s | +1.868 s |

Estos son tiempos de escritura SQL de datos sintéticos, no tiempos completos de lectura/validación/importación de un archivo Excel. El lote de 500 añade aproximadamente 1,87 s en esta máquina. Es un costo aceptable para una importación administrativa, pero debe considerarse al importar lotes grandes.

Las escrituras de modelos, tipos y familias toman un bloqueo asesor transaccional para que una edición concurrente no deje un documento obsoleto. Dos importaciones/ediciones del catálogo pueden esperar una a la otra hasta terminar su transacción. Las búsquedas y el registro de unidades de planta no toman ese bloqueo salvo que la operación también modifique el catálogo (como aprobar una incorporación).

Si una operación falla, se revierten tanto la ficha como sus proyecciones. La migración 0068 debe ejecutarse antes de desplegar esta versión: instala pg_trgm, crea índices y prepara las fichas existentes. Ya está aplicada localmente; no se ha reseteado la base ni reimportado el catálogo.

## Verificación

- 100 pruebas aprobadas en 10 suites: administración, Excel, modelo de origen y solicitudes de planta, búsquedas, mantenimiento de proyecciones y migración desde ambas historias del repositorio.
- Alta por API y nueva importación Excel quedan buscables; edición elimina términos y cantidades anteriores; cambios de tipo/familia se reflejan; rollback, lotes de 100, borrado en cascada y edición concurrente de modelo/familia comprobados.
- 31 consultas comparadas contra la implementación anterior sobre los datos reales: mismos conjuntos de IDs. Las 10 consultas del benchmark mantienen sus totales.
- 689 documentos preparados, 9175 cantidades indexadas; se conservan los 689 modelos y 15.296 especificaciones.
- La prueba de escritura dejó 0 registros sintéticos y el trigger de búsqueda habilitado.
- TypeScript y consistencia de migraciones verificados. No se activó corrección de erratas ni conversión de unidades.

Los JSON de métricas, planes SQL, paridad y escritura, y los scripts reproducibles, están en .local/: catalog-search-benchmark-2026-11-13.json, catalog-search-benchmark-optimized-2026-11-13.json, catalog-search-parity-2026-11-13.json, catalog-search-write-benchmark-2026-11-13.json.
