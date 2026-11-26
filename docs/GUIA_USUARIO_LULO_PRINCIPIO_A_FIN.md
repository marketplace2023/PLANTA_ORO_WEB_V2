# Guía de usuario de LULO: de los maestros al cierre de obra

Esta guía explica el funcionamiento implementado en el Ecosistema FUR. Describe las pantallas y acciones actuales, los requisitos para avanzar y los resultados que se deben comprobar. No es un manual de todas las funciones de LuloWin.

## 1. Elegir dónde comenzar

| Acceso local | Uso |
| --- | --- |
| [Web pública: Presupuestos LULO](http://localhost:5173/budgets) | Consultar maestros y preparar una estimación preliminar. |
| [LULO con contexto de planta en la web](http://localhost:5173/plants/revemin-ii/budgets) | Guardar y tramitar presupuestos y expedientes de REVEMIN II. |
| [Panel de planta: Presupuestos LULO](http://localhost:5174/plants/revemin-ii/budgets) | Realizar el ciclo completo descrito en esta guía. |

En el menú de la web, el acceso es **Servicios → Presupuestos (LULO)**. Las URL anteriores corresponden al entorno local y a REVEMIN II; para otra planta, selecciona su contexto y utiliza sus rutas.

El recorrido completo es:

**Cliente → Obra → Maestros y precios → Presupuesto → Revisión y emisión → Contrato → Planificación y cómputos → Cambios y mediciones → Valuaciones → Reconsideraciones, cuando correspondan → Conciliación → Cierre.**

Los anticipos y pagos se registran durante la ejecución según ocurran. Los cambios y reconsideraciones solo se utilizan cuando corresponden al contrato.

## 2. Requisitos antes de comenzar

1. Comprueba que la aplicación y la API estén disponibles.
2. Inicia sesión y selecciona la planta correcta.
3. Comprueba tu acceso al módulo. Los permisos de consulta, edición y aprobación son diferentes: `budget.read`, `budget.edit` y `budget.approve`.
4. Para cargar o consultar evidencias internas también necesitas los permisos de Documentos correspondientes.
5. Ten preparados los datos del cliente, alcance de obra, moneda, fechas, precios y respaldos.

Si una acción no aparece, revisa el estado del documento y tus permisos. Poder editar no implica poder emitir o activar un contrato.

Para una primera práctica crea registros con nombres y códigos que incluyan **PRUEBA**. No registres precios ni pagos ficticios como operaciones reales.

## 3. Conocer las secciones del módulo

En el panel de planta encontrarás:

| Sección | Para qué sirve |
| --- | --- |
| **Maestros y estimación** | Consultar y mantener maestros propios, gestionar precios y preparar presupuestos. |
| **Mis presupuestos** | Buscar y abrir presupuestos guardados, sus versiones y estados. |
| **Obras y clientes** | Registrar clientes y obras. |
| **Contratos y ejecución** | Activar contratos y gestionar su expediente hasta el cierre. |
| **Presupuestos anteriores** | Consultar el módulo previo. No es el punto de partida de este recorrido nuevo. |

## 4. Registrar el cliente

1. Abre **Obras y clientes**.
2. Selecciona la pestaña **Clientes**.
3. Pulsa **Nuevo cliente**.
4. Completa código, nombre o razón social, identificación fiscal, contacto y dirección.
5. Mantén el estado **Activo** y pulsa **Guardar cliente**.

**Resultado:** el cliente aparece en el listado y puede seleccionarse al crear una obra.

Utiliza **Editar cliente** para corregir sus datos o desactivarlo. Las copias de documentos ya emitidos conservan la información fijada en su emisión.

## 5. Registrar la obra

1. En **Obras y clientes**, selecciona **Obras**.
2. Pulsa **Nueva obra**.
3. Selecciona el cliente registrado.
4. Completa código de obra, nombre, ubicación y referencia contractual.
5. Mantén la obra activa y pulsa **Guardar obra**.

**Resultado:** aparece una obra con su cliente. Desde su fila puedes utilizar **Presupuestar**.

Registra la obra antes del presupuesto cuando quieras continuar posteriormente con un contrato.

## 6. Preparar maestros y APU

Un **insumo** es un material, equipo o registro de mano de obra. Una **partida** representa un trabajo medible. Su **APU** explica los insumos, cantidades y rendimiento utilizados para calcular el precio unitario.

### 6.1 Consultar la biblioteca común

1. Abre **Maestros y estimación → Consultar maestros LULO**.
2. Busca por código o descripción y utiliza los filtros disponibles.
3. Abre la ficha del registro.
4. Para una partida, revisa unidad, rendimiento, composición y origen de los precios.

La biblioteca recuperada del archivo original contiene 8.057 partidas/APU, 3.209 materiales, 672 equipos, 164 registros de mano de obra y 40 familias. Estos conteos no convierten los precios históricos en precios vigentes.

### 6.2 Crear o ajustar registros de planta

1. Selecciona el tipo de maestro y utiliza la opción para crear un insumo, familia o partida de planta.
2. Introduce un código nuevo, descripción, unidad y los demás campos requeridos.
3. En una partida, selecciona los insumos e introduce cantidades, desperdicio cuando aplique y rendimiento.
4. Guarda el maestro.
5. Para ajustar un registro desde su ficha, utiliza **Editar para esta planta** y **Guardar ajustes de planta**.

Los cambios privados de una planta no modifican la biblioteca pública. Los registros propios se pueden desactivar para nuevos usos sin borrar su historia.

### 6.3 Importar maestros desde Excel o CSV

1. Pulsa **Descargar plantilla** y lee sus instrucciones.
2. Sustituye la fila de ejemplo por tus registros. Usa los encabezados y formatos de la plantilla.
3. Importa primero los insumos. Después importa las partidas que utilizan esos códigos.
4. Pulsa **Importar Excel / CSV**.
5. Revisa la vista previa y corrige todos los errores del archivo.
6. Cuando el lote sea válido, pulsa **Confirmar carga de maestros**.

La carga no sobrescribe códigos existentes. Corrige esos registros desde su ficha para conservar el historial. Importar un maestro no equivale a publicar sus precios como vigentes: realiza también el paso siguiente.

## 7. Preparar listas y precios vigentes

1. En **Maestros y estimación**, abre **Listas y precios vigentes**.
2. Pulsa **Nueva lista de precios**.
3. Define código, nombre y moneda; pulsa **Crear lista**.
4. Selecciona la lista y busca un insumo.
5. Completa importe, unidad/base del costo, fecha base, vigencia, fuente y proveedor cuando corresponda.
6. Pulsa **Publicar precio con su fuente**.
7. Repite el proceso para los insumos del presupuesto.

Para corregir un precio publica una revisión nueva. Comprueba que la fecha base del presupuesto esté cubierta por la vigencia y que la moneda coincida con la lista.

En **Unidades y proveedores** puedes mantener las referencias de planta. Su existencia no autoriza conversiones arbitrarias de unidades o monedas.

**Importante:** los importes recuperados del MDB son históricos. Debes confirmar moneda, denominación, fecha y base de costo antes de utilizarlos para emitir un presupuesto real.

## 8. Crear el presupuesto

1. En la fila de la obra pulsa **Presupuestar**, o utiliza **Nuevo presupuesto**.
2. Si se abre la biblioteca, pulsa **Preparar presupuesto**.
3. En **Obra y origen de precios**, verifica la obra, la lista y la fecha base.
4. Completa título y demás datos del presupuesto.
5. Define moneda, decimales y porcentajes de cálculo.
6. Crea los capítulos con **Nuevo capítulo** y el botón **Agregar capítulo**. Puedes indicar un capítulo padre.
7. Selecciona el capítulo de destino antes de agregar partidas.

### 8.1 Agregar partidas

Puedes utilizar estas modalidades:

| Modalidad | Procedimiento |
| --- | --- |
| **Calculado por APU** | Selecciona una partida de la biblioteca, utiliza **Presupuestar con este APU** e introduce la cantidad de obra. |
| **Precio asumido** | Parte de una partida con APU, selecciona ese modo, introduce el precio adoptado y documenta el motivo. El cálculo del APU queda como referencia. |
| **Precio manual** | Pulsa **Agregar partida manual** y completa código, descripción, unidad, cantidad, precio y fuente o motivo. No tiene desglose de APU. |

Comprueba capítulo y condición **Gravado** en cada renglón. Si conoces el activo donde se ejecutará el trabajo, utiliza **Vincular activo por TAG**; puedes buscar por nombre/TAG y filtrar por etapa o red. El vínculo no cambia el precio.

### 8.2 Calcular y comprobar

1. Revisa los porcentajes: FCAS, administración, utilidad, financiamiento e impuesto.
2. Pulsa **Calcular presupuesto**.
3. Revisa precios unitarios, importes, subtotal, base imponible, impuesto y total.
4. En las partidas calculadas utiliza **Ver APU y mis precios** para revisar el desglose.
5. Si utilizas **Usar mi precio**, completa importe, fecha base, vigencia y motivo del ajuste.
6. Vuelve a calcular después de modificar datos.

El sistema señala cuando los importes visibles corresponden a un cálculo anterior. No uses esos importes como resultado de cambios todavía sin calcular.

### 8.3 Guardar y resolver pendientes

1. Pulsa **Guardar presupuesto**.
2. En ediciones posteriores, completa **Motivo de la operación** y pulsa **Guardar cambios**.
3. Si falta información, puedes documentarla en **Pendiente por resolver** y guardar el borrador.
4. Antes de enviarlo, resuelve el problema, limpia el pendiente y recalcula.

Las partidas pendientes se excluyen de los importes provisionales. No puedes enviar ni emitir un presupuesto con pendientes o precios no resueltos para su uso formal.

### 8.4 Recalcular un borrador existente

Si necesitas actualizar precios, utiliza el panel de recálculo del borrador:

1. Selecciona partidas y clases de insumo que deseas actualizar.
2. Indica expresamente si quieres reemplazar la estructura del APU.
3. Genera la propuesta y revisa valores anteriores, nuevos y advertencias.
4. Confirma solo si el alcance y los importes son correctos.

La propuesta vence a los quince minutos. Si cambia la revisión del presupuesto, genera otra propuesta. No se actualizan documentos emitidos de manera silenciosa.

## 9. Revisar, emitir y exportar el presupuesto

1. Abre el documento desde **Mis presupuestos**.
2. Comprueba que los cambios estén guardados y el cálculo actualizado.
3. Completa **Motivo de la operación** y pulsa **Enviar a revisión**.
4. El usuario con permiso de aprobación revisa fuentes, cantidades, modos de precio y totales.
5. Si hay observaciones, utiliza **Devolver para corrección**. Corrige, guarda y vuelve a enviar.
6. Si está conforme, introduce el motivo y pulsa **Emitir presupuesto**.

**Resultado:** el documento queda **Emitido** y sus datos de emisión se conservan. Para cambiarlo, utiliza **Crear nueva versión**; conserva la referencia de origen y tramita el nuevo borrador.

En el selector **Reporte**, elige Presupuesto, Por capítulos, Hoja de APU o Relación de insumos y pulsa **PDF** o **Excel**. Si los botones están deshabilitados, revisa cambios sin guardar o cálculo desactualizado.

## 10. Activar el contrato

1. Desde el presupuesto emitido pulsa **Continuar con el contrato de esta obra**. También puedes entrar en **Contratos y ejecución → Activar contrato**.
2. Selecciona el **Presupuesto emitido de origen** y la **Obra del contrato**.
3. Completa código, nombre, inicio y fin del contrato.
4. Define impuesto, amortización de anticipo, retención y anticipo máximo autorizado.
5. Revisa condiciones y notas.
6. Pulsa **Activar contrato desde presupuesto**.
7. En el listado, pulsa **Abrir expediente**.

**Resultado:** el expediente conserva las partidas y precios del presupuesto como línea base. El anticipo autorizado es un límite contractual; no equivale a un desembolso registrado.

## 11. Usar el flujo de documentos del expediente

Este procedimiento se repite en las secciones de ejecución y cierre:

1. Abre la sección y pulsa **Nuevo documento**.
2. Completa título, campos y evidencias.
3. Pulsa **Guardar borrador** y abre el documento guardado.
4. Completa **Motivo de la operación** y pulsa **Enviar a revisión**.
5. El usuario autorizado pulsa **Revisar resultado actual**.
6. Tras revisar el resultado, introduce el motivo y ejecuta la acción correspondiente:

| Tipo de documento | Acción final |
| --- | --- |
| Cómputo, medición, orden de cambio, cronograma, índice, perfil y movimiento de saldo | **Aprobar documento**. |
| Valuación, reconsideración y cierre | **Emitir documento**. |

Si requiere cambios, utiliza **Devolver a borrador**, corrige y repite la revisión. Los motivos de las operaciones deben tener al menos ocho caracteres.

Adjunta archivos mediante el control de evidencias del formulario o utiliza una referencia HTTPS cuando corresponda. Los archivos internos conservan su versión; los enlaces externos no son copias archivadas de su contenido.

## 12. Registrar cronograma y cómputos

### Cronograma

1. Abre **Cronograma → Nuevo documento**.
2. Agrega actividades, selecciona sus partidas y define fechas.
3. Asigna pesos cuya suma sea 100 %.
4. Selecciona las predecesoras cuando existan. Deben terminar antes del inicio de la actividad dependiente.
5. Documenta el motivo, guarda y aprueba.
6. Consulta el avance físico ponderado, planificado y económico en el expediente.

Las reprogramaciones se tramitan como nuevos planes aprobados. El cronograma exportado es tabular, no un diagrama de Gantt.

### Cómputos métricos

1. Abre **Cómputos métricos → Nuevo documento**.
2. Selecciona partida y ubicación.
3. Agrega las líneas necesarias de longitud, área rectangular, volumen rectangular o conteo.
4. Completa dimensiones, repeticiones, factor y unidades. Justifica las conversiones cuando correspondan.
5. Adjunta respaldo, guarda y aprueba.

El cómputo aprobado puede respaldar una medición. También puede transferirse a una partida de un presupuesto en borrador de la misma obra: abre **Transferir cantidad a un presupuesto en borrador**, selecciona destino, compara cantidad anterior/nueva y confirma. La transferencia no modifica un presupuesto emitido.

## 13. Tramitar cambios contractuales

Utiliza **Órdenes de cambio** cuando se aprueben aumentos, disminuciones, partidas nuevas o modificaciones de precio.

1. Crea un documento y define la fecha de vigencia.
2. Selecciona el movimiento y la partida; completa cantidad o precio según corresponda.
3. Para una partida nueva, completa código, descripción, unidad, cantidad y precio acordado.
4. Explica el motivo y adjunta evidencia.
5. Guarda, envía a revisión y aprueba.
6. Comprueba el contrato vigente en **Resumen y conciliación**.

No puedes aprobar una disminución incompatible con cantidades ya valuadas sin resolver previamente el ajuste. Los cambios no reescriben los períodos emitidos.

## 14. Registrar mediciones de campo

1. Abre **Mediciones → Nuevo documento**.
2. Selecciona partida, fecha de ejecución, ubicación y unidad.
3. Introduce cantidad y referencia de campo única.
4. Selecciona el cómputo aprobado si corresponde.
5. Adjunta la evidencia de ejecución.
6. Guarda, envía a revisión y aprueba.

**Resultado:** la cantidad aprobada queda disponible para valuación. Aprobar una medición no emite automáticamente una valuación ni registra un pago.

Para corregir una medición, identifica el documento original y explica el motivo. Las correcciones negativas tienen límites respecto de la cantidad de origen; no utilices referencias duplicadas para reemplazar el historial.

## 15. Preparar y emitir una valuación

1. Abre **Valuaciones → Nuevo documento**.
2. Introduce inicio y fin del período.
3. Selecciona las mediciones aprobadas que corresponden al período.
4. Indica la cantidad a valuar de cada medición; puedes usar una asignación parcial.
5. Si incluyes saldos de períodos anteriores, habilita expresamente su arrastre.
6. Guarda y envía a revisión.
7. Pulsa **Revisar resultado actual** y comprueba contratado, anterior, actual, acumulado, saldo, precios e importe.
8. Revisa bruto, base gravada, impuesto, amortización, retención y neto.
9. Introduce el motivo y pulsa **Emitir documento**.
10. Descarga **PDF / XLSX** desde el documento.

Emite los períodos en orden cronológico y sin solaparlos. Una cantidad no puede asignarse dos veces. Los precios se aplican según la fecha de ejecución; la amortización está limitada al anticipo desembolsado pendiente.

Si corriges ejecución emitida, identifica la valuación y los documentos de origen en los campos de corrección. No edites los documentos históricos como si fueran borradores nuevos.

## 16. Aplicar reconsideraciones, cuando correspondan

Este paso requiere una regla contractual aprobada. Si el contrato no contempla reconsideraciones, continúa con la conciliación.

### 16.1 Registrar índices

1. Abre **Índices → Nuevo documento**.
2. Completa código de serie, fecha, valor y fuente.
3. Adjunta respaldo y tramita su aprobación.
4. Registra las observaciones necesarias para el mes base y el mes de la valuación.
5. Para revisar una publicación, identifica su observación anterior en el campo de revisión.

El perfil implementado trabaja con observaciones mensuales. Una serie sin índice aplicable bloquea el cálculo.

### 16.2 Aprobar el perfil de ajuste

1. Abre **Perfiles de ajuste → Nuevo documento**.
2. Define vigencia, fecha base y componente fijo.
3. Agrega las series y coeficientes; el fijo más los coeficientes debe sumar 1.
4. Selecciona las partidas elegibles.
5. Indica si se permiten ajustes negativos y si el ajuste lleva impuesto, retención o amortización.
6. Guarda y aprueba el perfil.

La fórmula disponible es:

`Factor = fijo + Σ(coeficiente × índice del período / índice base)`.

### 16.3 Emitir la reconsideración

1. Abre **Reconsideraciones → Nuevo documento**.
2. Selecciona la valuación emitida, el perfil aprobado y las partidas del alcance.
3. Completa fecha y motivo; adjunta evidencia.
4. Guarda y envía a revisión.
5. Revisa índices, coeficientes, factor, base elegible, diferencia y conceptos aplicables.
6. Pulsa **Emitir documento** y exporta el reporte.

Para corregir un ajuste ya emitido, utiliza el campo de corrección. La corrección aplica el efecto incremental y conserva el documento anterior; no vuelvas a aplicar el mismo alcance como si fuera nuevo.

## 17. Registrar anticipos, pagos y liberaciones

1. Abre **Anticipos y pagos → Nuevo documento**.
2. Selecciona desembolso de anticipo, devolución de anticipo, liberación de retención o pago registrado.
3. Completa fecha, importe, referencia del comprobante y motivo.
4. Adjunta respaldo.
5. Guarda, envía y aprueba.
6. Verifica los saldos resultantes en **Resumen y conciliación**.

Registra el anticipo desembolsado antes de emitir las valuaciones que deban amortizarlo. Configurar un anticipo máximo en el contrato no crea ese desembolso.

Los movimientos son registros administrativos. No transfieren dinero ni confirman automáticamente operaciones bancarias.

## 18. Conciliar antes de cerrar

1. Abre **Resumen y conciliación**.
2. Selecciona la **Fecha de corte del expediente**.
3. Compara cantidades originales, vigentes, medidas, valuadas, restantes y sin valuar.
4. Compara contrato original/vigente, bruto ejecutado, reconsideraciones, impuestos y neto documentado.
5. Revisa anticipos, devoluciones, amortización, retenciones, liberaciones, pagos y saldos.
6. Abre los documentos pendientes al corte y tramita su resolución antes de cerrar.
7. Identifica las diferencias residuales que requieren una resolución contractual documentada.

El corte debe incluir los documentos que deseas cerrar. Puede ser posterior al fin de ejecución para contemplar movimientos administrativos posteriores.

No confundas **neto documentado** con **pagado**. Sin pagos registrados y conciliados, el saldo de pagos permanece pendiente de confirmación.

## 19. Emitir el cierre

1. Con el corte correcto, abre **Cierres**.
2. Pulsa **Nuevo documento**. Si está deshabilitado, revisa documentos pendientes y errores de conciliación.
3. Introduce título y motivo del cierre.
4. Para cada diferencia, completa resolución, responsable, condición de liquidación y evidencia.
5. Adjunta los respaldos generales del cierre.
6. Guarda y envía a revisión.
7. El usuario autorizado pulsa **Revisar resultado actual** y verifica fuentes, cantidades, importes y obligaciones.
8. Pulsa **Emitir documento**.
9. Descarga el cuadro de cierre en **PDF / XLSX**.

**Resultado:** el cierre conserva sus fuentes y el contrato queda cerrado, bloqueando nuevos movimientos.

Los saldos no tienen que ser todos cero: las obligaciones que continúan deben quedar justificadas, con responsable, condición y evidencia. Si cambian las fuentes después de la vista previa, vuelve a revisar antes de emitir.

## 20. Rectificar un cierre

1. Abre el cierre emitido.
2. Introduce el motivo de la rectificación.
3. Con permiso de aprobación, pulsa **Abrir rectificación del cierre**.
4. Tramita los documentos correctivos necesarios.
5. Repite conciliación y cierre con un corte igual o posterior al anterior.
6. Emite el cierre sucesor y conserva ambos documentos en el expediente.

La rectificación no borra ni modifica silenciosamente el cierre anterior.

## 21. Comenzar desde la estimación pública

Esta es una alternativa al inicio directo en planta:

1. Abre [Presupuestos LULO público](http://localhost:5173/budgets).
2. Consulta maestros y pulsa **Preparar estimación**.
3. Agrega partidas, cantidades, precios y parámetros; pulsa **Calcular presupuesto**.
4. Descarga PDF o Excel preliminar si lo necesitas.
5. Pulsa **Iniciar sesión para llevarlo a planta**.
6. Ya autenticado, selecciona la **Planta de destino** y pulsa **Guardar en planta**. Necesitas permiso de edición en esa planta.
7. Abre el documento guardado, vincula su obra y revisa las fuentes de precios antes de enviarlo.
8. Continúa desde la revisión y emisión descritas en esta guía.

El borrador público se conserva en ese navegador; no es almacenamiento sincronizado entre dispositivos. No permite emitir contratos, valuaciones o cierres sin acceso a planta.

## 22. Reportes implementados

Todos los siguientes tipos tienen salida PDF y Excel:

| Etapa | Reporte | Contenido principal |
| --- | --- | --- |
| Presupuesto | Presupuesto | Partidas, cantidades, PU, importes, impuesto y total. |
| Presupuesto | Resumen por capítulos | Subtotales por capítulo y subcapítulo. |
| Presupuesto | Hoja de APU | Composición, consumo, precios, rendimiento, fuentes y cálculo. |
| Presupuesto | Relación de insumos | Cantidades y costos de insumos de partidas calculadas. |
| Ejecución | Cómputo métrico | Dimensiones, fórmulas y cantidades resultantes. |
| Ejecución | Medición de obra | Datos de resultado, cantidades y referencias de medición. |
| Ejecución | Orden de cambio | Variación, vigencia, cantidades y precio acordado. |
| Ejecución | Valuación | Cantidades anteriores/actuales/acumuladas, saldos, fuentes y conceptos del período. |
| Ejecución | Cronograma | Actividades, fechas, pesos y predecesoras en tabla. |
| Ajuste | Índice publicado | Serie, fecha, valor, fuente y referencia de revisión. |
| Ajuste | Perfil de reconsideración | Fórmula, vigencia, fecha base, fijo y coeficientes. |
| Ajuste | Reconsideración | Índices, factor, bases, diferencias y conceptos del ajuste. |
| Saldos | Movimiento de saldo | Concepto, fecha, importe y referencia. |
| Cierre | Cuadro de cierre | Cantidades, importes, saldos, resoluciones y documentos fuente. |

En el presupuesto, utiliza el selector **Reporte**. En el expediente, abre cada documento y utiliza **PDF / XLSX**.

Los borradores se identifican como no emitidos. Las evidencias se relacionan mediante referencias; no se fusionan automáticamente todos sus archivos en un PDF único. Los Excel conservan decimales como texto para mantener precisión; no son libros con fórmulas para recalcular el contrato. La relación de insumos no interpreta precios manuales o asumidos como consumo físico.

## 23. Ejercicio completo de comprobación

Utiliza datos identificados como prueba. Este caso comprueba el recorrido, no valida precios reales ni condiciones legales o tributarias.

1. Crea cliente `CLI-PRUEBA-LULO` y obra `OBR-PRUEBA-LULO`.
2. Prepara una partida manual `PART-PRUEBA-LULO`, unidad `UND`, cantidad 100 y precio 25. Documenta que es ficticio.
3. Usa USD y deja todos los porcentajes en cero para este ejercicio. Calcula, guarda, revisa y emite: total esperado **2.500,00**.
4. Activa un contrato de prueba del 1 de enero al 31 de marzo de 2026, sin anticipo, amortización, retención ni impuesto.
5. Aprueba una orden de aumento de 10 unidades con vigencia 2 de enero. Contrato vigente: **110 unidades y 2.750,00**.
6. Aprueba un cronograma de una actividad con peso 100 % dentro de ese plazo.
7. Registra y aprueba mediciones de 30 unidades en enero, 20 en febrero y 60 en marzo, con referencias distintas y evidencias de prueba.
8. Emite las valuaciones cronológicamente: **750,00**, **500,00** y **1.500,00**. Al terminar deben quedar 110 unidades valuadas y saldo de cantidad cero.
9. Para probar reconsideración, aprueba una misma serie de índice con valor 100 al 1 de enero y 110 al 1 de febrero, indicando fuente ficticia de prueba.
10. Aprueba un perfil vigente desde el 1 de enero, fecha base 1 de enero, fijo 0 y un coeficiente 1 para esa serie. Selecciona la partida y deja desactivados los conceptos de impuesto, retención y amortización del ajuste.
11. Emite una reconsideración de la valuación de febrero, con fecha 1 de marzo. Resultado esperado: `500 × (110 / 100 − 1) = 50,00`.
12. Con corte 31 de marzo, comprueba **2.750,00 bruto + 50,00 ajuste = 2.800,00 neto documentado**.
13. Si registras pagos de prueba, identifícalos como simulados y respáldalos. Si no los registras, documenta en el cierre el saldo de pagos pendiente; no lo presentes como pagado.
14. Resuelve pendientes, emite el cierre y descarga sus reportes.

Las fechas del ejemplo pertenecen a un ejercicio histórico. En una obra real usa las fechas, fuentes y condiciones efectivas de su contrato.

## 24. Problemas habituales y qué revisar

| Situación | Revisión recomendada |
| --- | --- |
| No aparece una acción | Comprueba permisos, estado del documento y si el contrato está cerrado. |
| No permite enviar el presupuesto | Guarda los cambios, actualiza el cálculo, resuelve pendientes, revisa precios e introduce el motivo. |
| No permite activar contrato | El presupuesto debe estar emitido, con obra válida; necesitas permiso de aprobación. |
| No aparecen cantidades para valuar | La medición debe estar aprobada, con cantidad disponible y fechas compatibles. Comprueba si requiere arrastre explícito. |
| No permite emitir una valuación | Revisa período, solapamientos, cantidades disponibles, saldo contractual, fechas y revisión actual. |
| No aplica amortización | Comprueba el porcentaje y el desembolso de anticipo aprobado; no basta el máximo autorizado. |
| No calcula la reconsideración | Comprueba perfil aprobado, alcance, vigencia e índices mensuales base/período. |
| Informa revisión o fuentes modificadas | Vuelve a cargar el documento y genera una vista previa actual. No repitas una confirmación antigua. |
| Cierre deshabilitado o rechazado | Revisa pendientes al corte y completa todas las resoluciones con evidencia. |
| Exportación deshabilitada en presupuesto | Recalcula y guarda los cambios pendientes. |

## 25. Límites y comprobación de uso real

- No hay conversión automática de monedas ni actualización de precios históricos a valores actuales.
- Los índices son cargados y aprobados por usuarios; no existe una fuente oficial conectada automáticamente.
- Las reconsideraciones utilizan el perfil polinómico mensual implementado, no todas las fórmulas posibles de LuloWin.
- El módulo registra pagos para conciliación; no realiza transferencias ni tiene integración contable automática.
- Las mediciones se ingresan con sus respaldos; no son capturas automáticas desde sensores.
- No hay reportes gerenciales consolidados de todas las obras ni exportaciones gráficas de curva S o Gantt.
- Los presupuestos del módulo anterior no se convierten automáticamente en contratos del flujo nuevo.
- El recorrido se ha probado con datos de prueba. Para una obra real, el equipo responsable debe validar precios, condiciones, un presupuesto, períodos consecutivos de valuación y cierre. No se afirma equivalencia completa con LuloWin 2018.

## 26. Lista final de comprobación

- [ ] Cliente y obra correctos y activos.
- [ ] Precios, moneda, bases de costo y vigencias verificados.
- [ ] Presupuesto calculado, sin pendientes, revisado y emitido.
- [ ] Contrato activado desde la versión correcta.
- [ ] Condiciones contractuales y desembolsos registrados según corresponda.
- [ ] Cómputos, cronograma, cambios y mediciones tramitados.
- [ ] Valuaciones emitidas sin doble asignación y en orden cronológico.
- [ ] Reconsideraciones respaldadas cuando apliquen.
- [ ] Pagos y saldos conciliados sin confundir emisión con pago.
- [ ] Diferencias y obligaciones documentadas al corte.
- [ ] Cierre emitido y reportes descargados.

Para detalles del alcance técnico, consulta [Recorrido LULO: tres etapas](LULO_TRES_ETAPAS.md).
