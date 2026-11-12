# Equivalencia de reportes de LuloWin NG 2018

[Volver a la especificación](../ESPECIFICACION_EQUIVALENCIA_LULOWIN_NG_2018.md) · [Parámetros por reporte](reportes_2018.json)

## Cómo construir y verificar el centro de reportes

**Entrada.** Identificador de reporte, organización y compañía emisora, obra, versión o valuación, rango de partidas, parámetros de contenido y formato. Antes de calcular, validar acceso y coherencia de los documentos seleccionados.

**Flujo.** Abrir el centro, elegir reporte, seleccionar obra y documento, configurar filtros y opciones, generar vista previa y solicitar impresión o exportación. Reutilizar el mismo reporte si se invoca desde una ficha. Conservar rango, agrupación, orden, títulos y firmantes al pasar de vista previa a salida.

**Backend.** Cada identificador tiene un proveedor de datos, un contrato de parámetros y una plantilla de presentación. Reutilizar el proveedor entre reportes que comparten datos. La diferencia de plantilla u opción puede cambiar agrupación, encabezado o columnas. Cuando un formato especial cambie la base del cálculo, registrar esa regla con evidencia y un caso propio.

**Frontend.** Mostrar los parámetros aplicables al reporte seleccionado. El JSON contiene valores literales declarados en MenuRep.xml. Confirmar con 2018 cuáles opciones aparecen, cuáles se habilitan, sus valores iniciales y qué campos del resultado modifican. Conservar alcance al alternar salida. Una opción del XML no demuestra que ese control funcione en todas las obras.

**Validación.** Generar el mismo reporte en legado y web con datos y parámetros fijos. Comparar selección, encabezados, partidas, unidades, cantidades, columnas, subtotales, totales, redondeo y salida exportada. Para formatos especiales obtener una muestra de impresión. Validar firmantes, páginas y anexos requeridos. Un reporte estándar no sustituye una variante institucional.

### Parámetros comunes que deben verificarse

| Grupo | Significado y comportamiento |
| --- | --- |
| Alcance | Toda la obra, selección por rango o partida, capítulos y subcapítulos, valuación o medición específica. Guardar el conjunto de IDs y sus filtros. |
| Identificación | Fecha, código de proyecto, códigos internos y normativos, número alterno, ubicación, títulos, subtítulos, datos de compañía, logo y notas. El contexto del documento fija el encabezado. |
| Presentación de partidas | Descripción completa o una línea, separación, orden, inclusión de partidas sin movimiento y total por página. Los cambios de visualización conservan los totales de alcance que correspondan. |
| Costos y rendimiento | Precios y cantidades, códigos de insumos, horas-hombre, duración, rendimiento en meses, tasa de cambio, índices, títulos de FCAS y gastos médicos. Mantener unidad y base visibles. |
| Totales y condiciones | Incidencias, subtotales por capítulos, montos en letras, condiciones de la oferta, gráficos y FIDES o porcentaje de variación cuando corresponda. La opción de variación requiere base, tasa e IVA documentados. |
| Firmas | Datos y cargos de firmantes según el reporte. El XML declara campos hasta seis cargos en varias variantes. Contrastar cuántos usa cada plantilla y cómo se imprimen. |
| Salida | Vista previa, impresión y exportaciones disponibles, incluidas Excel o Word donde aplique. Verificar formato y contenido por reporte. Distinguir la exportación de presentación de la usada para importar datos. |

## Catálogo de las 45 opciones de MenuRep.xml

El código reproduce el identificador de la fuente. Las descripciones especifican la función esperada para la web. En las variantes que el manual no detalla, el ID y el título confirman su presencia. Sus campos, cálculos propios y formatos se validan con una muestra de la versión 2018.

### Análisis de precios unitarios

| ID | Reporte y propósito | Comprobación específica |
| --- | --- | --- |
| Pan01.01 | APU estándar. Hoja de análisis de la partida, con materiales, equipos, labor, rendimiento, factores y PU. | Conciliar recursos y subtotales con la ficha APU y controlar la opción de mostrar códigos, notas y total. Manual 522–527. |
| Pan01.02 | APU resumido. Vista condensada del análisis. | Comparar qué líneas y subtotales conserva respecto al estándar. |
| Pan01.03 | APU G.M.V.V. Presenta análisis según el formato identificado para esa entidad. | Obtener muestra y validar títulos, clasificación, campos y firmantes. |
| Pan01.04 | APU reexpresado en horas. Presenta las bases de tiempo en horas cuando el reporte las convierte. | Probar jornada y rendimiento conocidos. Comparar unidades, valores y PU con el cálculo base. |
| Pan01.05 | APU PDVSA. Análisis con formato para PDVSA. | Validar columnas, tratamiento del perfil especial y firmas mediante impresión 2018. |
| Pan01.06 | APU PDVSA GAS. Variante para PDVSA Gas. | Comparar diferencias de campos y presentación con Pan01.05 y validar una muestra propia. |

### Presupuestos

| ID | Reporte y propósito | Comprobación específica |
| --- | --- | --- |
| Pan02.01 | Presupuesto estándar. Lista partidas, unidades, cantidades, PU e importes con condiciones y totales. | Reconciliar con versión emitida, opciones de códigos, IVA, incidencias y monto en letras. Manual 529–540. |
| Pan02.01B | Presupuesto por capítulos. Agrupa partidas y subtotales por capítulo y subcapítulo. | Probar capítulos parciales y sin asignación, con subtotales e incidencias. Manual 541–547. |
| Pan02.02 | Presupuesto CORPOELEC. Presentación institucional del presupuesto. | Validar campos, encabezado, agrupación, firmas y salida propios. |
| Pan02.03 | Presupuesto SINFRA CARABOBO. Presentación institucional del presupuesto. | Verificar la muestra del organismo y la selección de firmas disponible. |
| Pan02.04 | Presupuesto GMVV. Presentación de partidas y totales para ese formato. | Contrastar una muestra independiente, incluidos títulos y referencias. |

### Mediciones y cómputos

| ID | Reporte y propósito | Comprobación específica |
| --- | --- | --- |
| Pan03A.01 | Medición estándar. Documenta cantidades ejecutadas por control y partida. | Validar período, dimensiones, ubicación, observaciones y totales contra el control. Manual 548–552. |
| Pan03B.01 | Cómputos métricos. Documenta dimensiones y cantidades previstas por partida. | Conciliar con hoja de cómputo y distinguir su origen del de medición, incluso cuando comparten plantilla RPT. Manual 554–558. |

### Valuaciones

| ID | Reporte y propósito | Comprobación específica |
| --- | --- | --- |
| Pan04.0.1 | Valuación estándar con acumulados. Presenta anterior, período y acumulado. | Comparar dos períodos, partidas sin movimiento y bases de acumulado. Manual 560–567. |
| Pan04.0.2 | Valuación estándar sin acumulados. Centra la salida en cantidades e importes del período. | Comparar con la anterior y verificar qué campos se omiten y qué totales se conservan. Manual 568–571. |
| Pan04.0.3 | Valuación estándar con avance. Incluye indicador de avance según base del reporte. | Validar un ejemplo con aumento y disminución. Identificar denominador y redondeo del porcentaje. Manual 572–574. |
| Pan04.0.4 | Valuación por capítulos. Agrupa ejecución e importes por capítulo. | Conciliar cada subtotal con las líneas del período y validar títulos de agrupación. Manual 575–579. |
| Pan04.0.5 | Carátula estándar. Resume la valuación con datos de identificación, importe y deducciones. | Verificar anticipo, IVA, retenciones, reconsideración y opción de última valuación. Manual 580–584. |
| Pan04.0.6 | Factura SENIAT. Genera la presentación identificada como factura a partir de la valuación. | Confirmar campos, numeración y valores que imprime el original. Cualquier uso fiscal productivo requiere aprobación del formato aplicable. |
| Pan04.1.1 | Valuación BANESCO. Presentación de valuación para el banco. | Comparar campos de cabecera, cantidades, importes y firmas con una muestra. Manual 585–589. |
| Pan04.1.2 | Valuación Banco de Venezuela. Presentación de valuación para el banco. | Contrastar su formulario, requisitos y totales con una muestra 2018. |
| Pan04.2.1 | Valuación Fundación Propatria 2000. Salida para ese organismo. | Reproducir campos y agrupaciones que corresponden a la variante. Manual 590–592. |
| Pan04.2.2 | Valuación C.A.N.T.V. Salida para el ente contratante. | Comparar encabezado, datos del contrato, líneas, deducciones y firmas según muestra. Manual 593–599. |
| Pan04.2.3 | Valuación Metro de Valencia. Formato específico de la valuación. | Verificar alcance, encabezado y subtotales con la muestra. Manual 600–602. |
| Pan04.2.4 | Valuación IVSS. Formato específico de la valuación. | Reconciliar cantidades, conceptos y estructura de impresión. Manual 603–605. |
| Pan04.2.5 | Valuación HIDROVEN. Formato específico de la valuación. | Validar datos de obra, período, columnas e importes. Manual 606–608. |
| Pan04.2.6 | Valuación FEDE. Formato específico de la valuación. | Obtener muestra 2018, identificar campos y probar la salida. |
| Pan04.2.7 | Valuación SINFRA CARABOBO. Formato específico de la valuación. | Verificar una muestra de la valuación y sus parámetros, aparte del presupuesto del mismo organismo. |

### Reconsideración y cierre

| ID | Reporte y propósito | Comprobación específica |
| --- | --- | --- |
| Pan05.01 | Análisis de reconsideración. Compara análisis original y ajustado y muestra parámetros. | Probar ambos métodos y cotejar insumos, factores, PU y diferencias. Manual 609–613. |
| Pan05.02 | Valuación estándar de reconsideración. Presenta los importes del ajuste relacionados con la valuación. | Conciliar diferencia por partida, total, IVA y referencia a la valuación de origen. Manual 614–617. |
| Pan06 | Cuadro de cierre y demostrativo. Consolida original, variaciones, ejecución y cantidades de cierre. | Reconciliar partidas originales, aumentos, disminuciones, extras y documentos del corte. Manual 651–658. |
| Pan06.01 | Cierre y demostrativo Banco de Venezuela. Variante institucional de cierre. | Comparar contenido, agrupación y firma propios con una muestra 2018. |

### Listados de insumos

| ID | Reporte y propósito | Comprobación específica |
| --- | --- | --- |
| Pan07.01 | Listado de materiales. Consulta y exportación del catálogo de materiales. | Comparar código, unidad, costo, vigencia y filtros disponibles. Manual 619–622. |
| Pan07.02 | Materiales por familia. Agrupa el catálogo de materiales por clasificación. | Conciliar pertenencia, orden, filtros y filas sin familia. Manual 623–625. |
| Pan07.03 | Listado de equipos. Consulta los costos y campos de equipos del maestro. | Verificar costo base, diario y demás campos que muestra la variante. Manual 626–628. |
| Pan07.04 | Equipos por familia. Agrupa equipos por clasificación. | Verificar orden, grupos y recuento por familia. Manual 629–631. |
| Pan07.05 | Listado de mano de obra. Consulta oficios y salarios de catálogo. | Verificar códigos, vigencias y salarios con el filtro aplicado. Manual 632–634. |
| Pan07.06 | Mano de obra por familia. Agrupa oficios por clasificación. | Validar familias, filas sin asignar y alcance. Manual 635–637. |

### Reportes adicionales

| ID | Reporte y propósito | Comprobación específica |
| --- | --- | --- |
| Pan08.01 | Insumos por proyecto u obra. Consolida recursos de las partidas seleccionadas. | Probar material por cantidad de obra, equipo y mano de obra convertidos por rendimiento, y partidas manuales sin insumos. Manual 639–650. |
| Pan08.02 | Memorias descriptivas por partida. Emite el texto técnico de las partidas del alcance elegido. | Comparar selección de original o variaciones, orden y contenido. Manual 659–663. |
| Pan08.03 | Estructuras de costos. Resume composición de costos en el alcance del reporte. | Conciliar material, equipo, labor e indirectos y verificar columnas y agrupaciones exactas. Manual 664–668. |
| Pan08.04 | Estructuras de costos unitarios. Presenta composición en base unitaria. | Comparar unidad, importes por unidad y tratamiento de partidas sin APU. Manual 669–671. |
| Pan08.041 | Listado de partidas por obra en Excel. Salida tabular de partidas desde el centro de reportes. | Validar columnas, tipos de celda y alcance. Comparar con el exportador de intercambio para identificar diferencias. |
| Pan08.05 | Valor agregado nacional. Informa el aporte nacional según insumos y proporciones registrados. | Confirmar base, proporción nacional/importada, tratamiento de indirectos y redondeo con una muestra. Manual 672–676. |
| Pan08.06 | Comparación de presupuestos. Contrasta dos presupuestos para identificar diferencias. | Probar misma partida con cambios de PU o cantidad, partida agregada y retirada. Confirmar clave de comparación y totales. Manual 677–681. |

El manual también presenta acceso desde el centro de reportes a abrir la base, seleccionar obra, consultar resumen y salir. Reutilizar AR01, AR02, AR04 y AR13 según el contexto. Las salidas del cronograma se verifican aparte en CR04–CR07, con el módulo LuloCronNG.
