# Conciliación de tablas y funciones por confirmar en 2018

[Volver a la especificación](../ESPECIFICACION_EQUIVALENCIA_LULOWIN_NG_2018.md)

La inspección de LULO.mdb permite buscar funciones que no figuran con claridad en el índice del manual. Una tabla confirma almacenamiento. Para declarar una función operativa se necesita ubicar su pantalla, acción o reporte y comprobar qué lee y escribe.

## Mapa de tablas a capacidades

| Tablas del paquete | Área a conciliar | Fichas |
| --- | --- | --- |
| ObraProy, ObraMisc, ObraClie, ObraProv, ObraPais | Obras, compañía y contraparte, condiciones, moneda, encabezados y proveedores. | MD05, MD09, MD10, MD12, OP03 |
| ObraMate, ObraEqui, ObraMano, ObraFami, ObraIndi | Insumos, familias e índices. | MD01–MD04 |
| ObraPart, ObraPainMate, ObraPainEqui, ObraPainMano | Partidas maestras y composición por tipo de insumo. | MD06–MD08, UT01–UT05 |
| ObraApun, ObraApinMate, ObraApinEqui, ObraApinMano | Renglón de obra, copia de recursos, parámetros y subtotales del análisis. | PR01–PR05, CL01–CL11 |
| ObraCapi, ObraCapiApun, ObraCapiDesc, ObraCapiDescCS, ObraCapiPart | Capítulos, subcapítulos y asignaciones de partidas. | PR06 |
| ObraAumeDismEnc, ObraAumeDism | Encabezado y renglones de variaciones. | EJ01–EJ03 |
| ObraCompEnc, ObraComp, ObraMediEnc, ObraMedi, ObraMediFact | Cómputos, mediciones y factores. | EJ04–EJ06, INVA03 |
| ObraMemo | Memorias de partidas. | EJ07 |
| ObraValu, ObraVaPa, ObraCara | Valuación, cantidades por partida y datos adicionales para carátula. | VA01–VA06, INVA04 |
| ObraReco, ObraRecoInsu, ObraRepa | Reconsideración, costos e índices por insumo, y análisis resultante. | RC01–RC04 |
| ObraCrono, ObraPSec, ObraDFer, ObraDLab, ObraCroCapi, ObraCroCIns, ObraCroMIns, ObraCroPCan, ObraCroPMto | Cronograma, secciones, calendario y series de cantidades, recursos e importes por períodos. | CR01–CR07, INVA05 |
| ObraBanc, ObraGast, ObraTiGa, ObraIngr, ObraEgre | Catálogos y registros que sugieren operación administrativa o financiera. | INVA01 |
| ObraGrup | Catálogo de grupos referenciado por el campo CodGru de ObraApun. | INVA02 |
| ObraConf, ObraSegu, ObraUsua, ObraVers | Configuración, seguridad, usuarios y versión. | OP01–OP04, AY02 |

## Fichas para investigar antes de cerrar la equivalencia

| ID | Qué se encontró y qué podría significar | Pasos para decidir e implementar |
| --- | --- | --- |
| INVA01 Ingresos, egresos, bancos y gastos | ObraIngr tiene documento, monto, fecha de cobro, banco, cheque y retenciones. ObraEgre tiene documento, factura, gasto, emisión, vencimiento, pago, deducciones, proveedor y estado de cancelación. Existen catálogos ObraBanc, ObraGast y ObraTiGa. | Buscar gestión de cobros y pagos en el principal, cronograma y reportes. Si hay pantallas activas, documentar alta, edición, cancelación, conciliación, filtros y salida, y probar cómo se relacionan con la obra. Si solo quedan tablas históricas, preservar datos y documentar evidencia de su condición. |
| INVA02 Grupos de partidas | ObraGrup tiene código y descripción. ObraApun guarda CodGru, además del campo de capítulo. | Revisar selector, alta y consultas por grupo. Si el grupo participa en filtros o reportes, modelarlo separado de capítulos y probar un renglón que pertenezca a ambos. |
| INVA03 Factores de medición | ObraMediFact almacena código, descripción y factor. Cómputos y mediciones guardan hasta cuatro cantidades, unidad, factor y total. | Confirmar la edición del maestro y el algoritmo por unidad. Probar factor distinto de uno, cantidades vacías, deducción y dimensiones combinadas. Documentar qué se aplica en cada pantalla y salida. |
| INVA04 Datos administrativos de carátula | ObraCara incluye fechas y oficios, varios anticipos, su IVA y retenciones. ObraValu contiene amortizaciones múltiples, IVA de anticipo y retención por suministros. | Recorrer pantallas de carátula, anticipo y valuación. Separar campos de presentación de los que cambian el importe. Documentar origen, prioridad, base y límite por cada concepto, y comparar cada salida. |
| INVA05 Secciones y series del cronograma | ObraPSec contiene secciones, partida base, duración y porcentaje. Varias tablas de cronograma guardan series Mes1…Mes104. | Confirmar cómo se divide una partida, cómo se calcula distribución por período y qué escala temporal usa cada consulta. Probar recomposición de cantidad, importe y necesidad de insumos al sumar las secciones. Tratar el ancho de la tabla como un dato del esquema, sin deducir un límite operativo solo por el nombre de columnas. |
| INVA06 Diferencias entre ediciones | El manual corresponde a 2012 y el instalador a 2018. El XML incluye variantes de reportes ausentes del índice del manual. | Con la versión autorizada, inventariar menú, barras, acciones de contexto, subventanas, pestañas y estados. Registrar opciones habilitadas por perfil o por tipo de obra. Agregar fichas con su evidencia antes de declarar el alcance cerrado. |

## Secuencia de validación del producto original

1. Preparar copias de la base y una obra reproducible. Registrar versión, compilación, idioma, configuración regional y modo de cálculo observado.
2. Recorrer las aplicaciones principal, reportes y cronograma. Buscar todas las entradas de la matriz. Registrar también las acciones subordinadas y controles que aparecen solo al activar un parámetro.
3. Resolver las seis fichas INVA. A cada capacidad activa asignarle una ficha de negocio y un caso de prueba. A cada tabla histórica asignarle una decisión de migración respaldada.
4. Emitir un archivo de muestra por cada reporte y formato de intercambio requerido. Guardar valores esperados, encabezados, selección, parámetros y resultado. Revisar con el usuario de negocio los cambios de interacción necesarios para la web.
5. Cerrar cada punto en la matriz únicamente con evidencia. Las variantes con cálculo sin confirmar, las exportaciones sin prueba de reapertura y los menús del satélite sin recorrer quedan visibles como pendientes de equivalencia.
