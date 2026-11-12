# Ejecución, reconsideraciones, cronograma y cierre

[Volver a la especificación](../ESPECIFICACION_EQUIVALENCIA_LULOWIN_NG_2018.md) · [Etapa 2](../ETAPA_02_CONTROL_DE_OBRA.md) · [Etapa 3](../ETAPA_03_RECONSIDERACIONES_Y_CIERRE.md)

## Variaciones y control de cantidades

| ID, función y páginas impresas | Significado y operación | Datos, reglas y aceptación |
| --- | --- | --- |
| EJ01 Presupuesto de aumentos · 343–359 | Registra cantidades adicionales de partidas del contrato. Cada presupuesto de aumento tiene número, fecha y detalle propio. | Seleccionar obra y partida, registrar cantidad y PU aplicable y calcular importe. Mantener cada documento por separado. Verificar si el original toma PU contractual, asumido u otra vigencia según modo. Probar dos aumentos sobre una misma partida. |
| EJ02 Presupuesto de disminuciones · 360–377 | Registra cantidades que se descuentan de una partida contractual y su efecto en el presupuesto modificado. | Guardar cantidad positiva y signo de movimiento. Comparar saldo vigente y acumulado valuado. Una reducción incompatible requiere resolución antes de aprobar. Probar el efecto en resumen, saldo y cierre. |
| EJ03 Obras extras · 61–67, 343–377, 541–547 | Trabajos adicionales identificados como extras en el presupuesto y en el resumen. Se separan de los aumentos de una partida existente. | Permitir definir código, alcance, unidad, cantidad y precio de la partida extra con APU o valor adoptado según corresponda. Confirmar el mecanismo de clasificación y numeración en 2018. Probar original, aumento, disminución y extra en la misma obra. |
| EJ04 Control de mediciones · 423–451 | Documenta cantidades ejecutadas con un número de control y período. Detalla cada partida, sus líneas de medición, ubicación y observaciones. | Modelar encabezado y líneas. Guardar dimensiones, factores, resultados y método. Conservar el total calculado por partida y el vínculo con la evidencia. Probar dos ubicaciones, copia de una línea, copia desde otra medición y comparación de totales. |
| EJ05 Cómputos métricos · 452–479 | Determina cantidades previstas a partir de planos o levantamientos. Puede transferir la cantidad calculada a la partida del presupuesto. | Usar la misma representación de dimensiones con origen distinto al de la ejecución. Confirmar fórmulas por unidad, combinación de dimensiones y tratamiento de deducciones. Probar área, volumen y conteo, y transferencia autorizada a una partida del destino elegido. |
| EJ06 Intercambio de planillas · 423–479 | En mediciones y cómputos aparecen funciones de importación/exportación Excel y copia en pantallas subordinadas. | Preservar columnas de dimensiones, unidad, ubicación y observaciones. Revisar qué controles están habilitados en cada ventana 2018. Probar exportar y reimportar una planilla y conservar el total por partida. |
| EJ07 Memorias descriptivas · 480–490 | Documenta alcance, procedimiento, materiales, criterios y circunstancias de una partida. Puede corresponder al original o a una variación. | Mantener texto y revisión asociados a obra, tipo de presupuesto y partida. Permitir alta, edición, retiro según estado y salida por partida. Probar dos memorias para el mismo código en contextos diferentes. |

## Valuaciones

| ID, función y páginas impresas | Significado y flujo | Regla y prueba |
| --- | --- | --- |
| VA01 Valuación directa · 32, 378–402 | El original permite **valuar sin medir**. Se ingresan directamente las cantidades a cobrar por partida y período. | Implementar modo DIRECTA, con origen explícito, usuario y soporte requerido por el contrato. El cálculo de saldo usa cantidades emitidas en ambos modos. Probar que se puede emitir sin un parte de medición cuando el perfil permite captura directa. |
| VA02 Valuación con mediciones · 378–402, 423–451 | Usa cantidades de ejecución documentadas en controles de medición cuando el flujo las vincula. | Asociar mediciones elegibles y registrar cantidad consumida por asignación. Determinar en 2018 qué acción copia, trae o vincula la cantidad y su tratamiento al modificar. Probar asignación parcial y prevención de duplicidad. |
| VA03 Cabecera, períodos y selección · 378–402 | Mantiene número, número alterno, fechas, obra, cantidades e importes. Permite consultar la valuación previa y actualizar la del período. | Guardar número y alterno separados. Definir corte y orden con el contrato. Filtrar por período y partida. Probar primer período, siguiente período y cambio de número alterno sin perder el enlace. |
| VA04 Cantidad anterior, actual, acumulada y avance · 378–402, 560–579 | Presenta el avance y diferencia entre lo ya cobrado y lo del período. | Calcular anterior desde emisiones previas válidas, actual por modo de captura, acumulada como suma y saldo contra el contrato vigente. Verificar base del porcentaje de avance según reporte. |
| VA05 Anticipos, amortizaciones, retenciones e IVA · 238–249, 378–402, 580–584 | Reconoce conceptos contractuales y fiscales que alteran el neto de la valuación y de su carátula. | Guardar por concepto base, importe, tasa, signo, vigencia, orden y saldo. La tabla del paquete contiene campos para retenciones, amortizaciones, IVA y suministros. Verificar en qué pantalla se editan y comparar las variantes individualmente y combinadas. |
| VA06 Corrección, copia y salida · 378–402, 727–732 | Permite consultar, modificar o administrar valuaciones, exportar reportes y copiar desde otra obra mediante utilitario. | Antes de escribir, validar referencias y acumulados. Para documentos emitidos usar una corrección con referencia y efecto incremental. Comparar con las acciones y restricciones reales del original. Probar reporte con y sin acumulados y carátula. |

### Contrato de cálculo de una valuación

1. Seleccionar obra, número, período y modo. Resolver partidas vigentes. Guardar número alterno y observaciones si aplica.
2. Obtener por partida la cantidad anterior emitida. Capturar directamente la actual o proponerla desde mediciones. Preservar el origen por renglón y controlar que una cantidad ya cobrada no se vuelva a asignar.
3. Aplicar PU y moneda del contrato. Calcular importe del período y acumulados. La cantidad contractual vigente incorpora aumentos, disminuciones y extras aprobados según fecha. Mostrar excedentes y partidas no conciliadas antes de emitir.
4. Aplicar conceptos conforme al perfil. Comparar bruto, impuestos, deducciones y neto. Registrar movimientos de anticipo y retención. Mantener separado el dato de pago de la emisión de la valuación.
5. Validar revisión y permisos. Emitir atómicamente, fijando cantidades, bases y condiciones de reporte. Conservar evidencia para futuras reconsideraciones.

Caso de prueba propuesto. Una partida de 100 unidades con aumento de 10, acumulado previo 30 y actual 20 queda con acumulado 50 y saldo 60. A 25,00 por unidad, el bruto del período es 500,00. Repetir con cantidades directas y con mediciones, y comprobar origen de la cantidad y mismo resultado cuando el resto de las condiciones coincide.

## Reconsideraciones

| ID, función y páginas impresas | Significado y operación | Qué verificar |
| --- | --- | --- |
| RC01 Selección de valuación y parámetros · 403–408 | Elige valuación, fecha de elaboración, método y valores nuevos de factores, bonos e insumos. | Guardar parámetros y método elegido. Registrar cuáles factores se incluyen, tasas anteriores y propuestas y fechas de índice. Mantener la valuación original. |
| RC02 Variación directa · 403–422 | Reconsidera al sustituir costos o parámetros con evidencia de comprobación directa. | Construir el APU reconsiderado a partir de la base congelada y aplicar únicamente cambios elegibles. Mostrar costo por insumo, subtotal anterior y nuevo, y diferencia. Confirmar precio base, cantidad elegible, precio adoptado, tratamiento de partidas sin APU y redondeo con casos del original. |
| RC03 Por índices · 403–422 | Usa familia y valores de índice de los períodos inicial y final para ajustar los costos elegibles. | Resolver índices por familia y período. Guardar fuente y revisión, controlar ausencia o base cero. Comparar cada costo ajustado y los totales. El manual menciona fórmulas escalatorias y variantes por ente. Validar si un caso se aplica por insumo o mediante factor contractual agregado antes de codificarlo. |
| RC04 Consultar, recalcular y reportar · 409–422, 609–617 | Permite ver resultados y recalcular con nuevos parámetros, y emite análisis comparativo y valuación de reconsideración. | Preservar original y nueva revisión, registrar diferencias e impedir doble aplicación sobre la misma cantidad y alcance. Probar corrección posterior, efecto del IVA y dos salidas con idénticas bases. |

Para diseñar las pruebas, usar una valuación de referencia y variar una sola entrada cada vez. Contrastar variación directa de un material, dos familias con índices diferentes, cambios de FCAS o bono, exclusión de un indirecto, valores negativos según contrato e índice ausente. La prueba debe reproducir línea de recurso, PU reconsiderado, cantidad, diferencia y reporte.

## Cronograma LuloCronNG

El manual impreso p. 33 identifica el módulo separado y sus resultados. El paquete trae LuloCronNG.exe y la base contiene tablas de cronograma. Esto acredita que hay un módulo y funciones asociadas. La lista completa de menús y algoritmos del satélite exige recorrerlo en una instalación autorizada.

| ID | Qué debe cubrir | Prueba mínima |
| --- | --- | --- |
| CR01 Plan de obra y actividades | Convertir partidas o grupos en actividades. Guardar duración, inicio, fin, recursos, unidad de tiempo y la revisión del plan. Revisar comportamiento ante renumeración de partidas. | Crear plan desde un presupuesto y conciliar actividades, duración y capítulos. |
| CR02 Gantt y precedencias | Mostrar actividades en tiempo y permitir ordenar dependencias, fechas y restricciones según reglas observadas. | Probar cadena, paralelismo, precedencia circular y desplazamiento del inicio. |
| CR03 Calendario | Registrar jornada, días laborables, fines de semana y feriados cuando la aplicación los use. | Comparar una actividad que atraviesa un día no laborable con el resultado del satélite. |
| CR04 Curva de inversión | Distribuir el importe planificado por períodos y mostrar acumulado. | Sumar períodos y cotejar con el monto de actividades incluidas. Confirmar método de reparto y unidad de tiempo. |
| CR05 Cronograma de pagos | Representar el importe previsto de pago por período según planificación y condiciones. | Distinguir inversión y pago y conciliar importes y desfases. Confirmar parámetros disponibles en el satélite. |
| CR06 Necesidad de insumos en el tiempo | Derivar necesidades de material, equipo y mano de obra de las actividades y de su APU. | Conciliar requerimientos acumulados con la cantidad total planificada, probando actividad que cruza dos períodos. |
| CR07 Consultas y reportes del satélite | Mostrar planificación física e información administrativa, gerencial y de inspección. | Recorrer cada menú 2018, catalogar salidas y controles, y agregar fichas para las opciones descubiertas. |

## Cierre y demostrativo

| ID | Significado y flujo | Aceptación |
| --- | --- | --- |
| CI01 Resumen de contrato | Reconcilia original, aumentos, disminuciones, extras y contrato modificado. | Las diferencias del resumen se pueden rastrear a documentos de variación por partida y fecha. |
| CI02 Demostrativo de cantidades · 651–658 | Presenta cantidades originales, modificadas, ejecutadas y saldos por partida. | Probar una partida aumentada, una disminuida y una extra, con documentos de origen visibles. |
| CI03 Cuadro de cierre · 651–658 y MenuRep.xml | Integra importes de contrato y ejecución al corte. Se parametriza según el reporte estándar o el formato especial. | Conciliar con las valuaciones emitidas, separar ajustes, anticipos y retenciones según perfil, y validar los reportes estándar y Banco de Venezuela. |
| CI04 Expediente y trazabilidad web | Conserva el corte, las fuentes y la resolución de diferencias en la emisión web. | Una actualización posterior del catálogo conserva los valores del cierre emitido. La rectificación crea revisión vinculada y preserva su motivo. |

## Orden de implementación

Construir variaciones y cantidades primero. Agregar ambos modos de valuación y sus conceptos. Implementar reconsideraciones sobre valuaciones emitidas. Desarrollar cronograma como módulo dependiente del presupuesto y la ejecución. Terminar con conciliación y cierre. Cada área usa la misma identidad de obra y partida para que presupuesto, cronograma, medición y reporte puedan cruzarse sin duplicar partidas ni cantidades.
