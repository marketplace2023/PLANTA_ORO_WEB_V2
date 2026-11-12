# Recorrido LULO: presupuestación, ejecución y cierre

Implementación funcional de las tres guías, actualizada al 12 de noviembre de 2026. Se integra en NestJS/PostgreSQL y comparte componentes entre la web y el panel de planta. No usa una aplicación administrativa separada para gestionar las obras.

## Entradas

- Panel de planta: `http://localhost:5174/plants/revemin-ii/budgets`.
- La misma funcionalidad con contexto de planta en la web: `http://localhost:5173/plants/revemin-ii/budgets`.
- Consulta y estimación pública: `http://localhost:5173/budgets`.

## 1. Preparar el presupuesto

1. En **Obras y clientes**, registre el cliente y la obra. Puede editar sus datos o desactivarlos sin borrar su historia.
2. En **Maestros y estimación** consulte los maestros originales o cree insumos, familias y partidas propios de planta. El editor de APU permite agregar, sustituir y quitar insumos, cambiar cantidades, desperdicio y rendimiento. Los maestros propios se pueden desactivar y reactivar.
3. **Unidades y proveedores** mantiene referencias adicionales. **Listas y precios vigentes** conserva publicaciones sucesivas de precios, con importe, moneda, unidad/base temporal, fuente, proveedor y vigencia. Una corrección del precio genera una revisión nueva.
4. **Descargar plantilla / Importar Excel o CSV** permite validar una carga completa y revisar errores antes de confirmar. No sobreescribe códigos existentes. Primero importe insumos, después partidas que los utilicen. La confirmación es transaccional y repetible sin duplicar registros.
5. Prepare un presupuesto, seleccione obra, lista, fecha base, capítulos, partidas y cantidades. Puede usar precio calculado, manual o asumido; este último conserva el cálculo del APU como referencia. El vínculo opcional a un activo conserva TAG, etapa y redes sin modificar el monto.
6. Una partida pendiente se excluye de los importes provisionales; el borrador permanece guardable. Se bloquea su envío o emisión hasta resolver los pendientes y la vigencia de los precios.
7. El recálculo permite seleccionar APU y clases de insumo. Reemplazar estructura es explícito. La propuesta muestra importes anteriores/nuevos y vence a los quince minutos. Cambios posteriores de revisión invalidan la confirmación.
8. Envíe a revisión y emita con permiso. El documento conserva datos de obra/cliente, precios, identificadores de sus revisiones, composición, factores y resultado. Una nueva versión conserva su vínculo con la emisión anterior.

Los 8.057 APU, 3.209 materiales, 672 equipos, 164 registros de mano de obra y 40 familias originales siguen en la base común. Los registros y ajustes propios de planta no alteran el catálogo público. Los importes del MDB siguen siendo históricos hasta verificarlos; no se convierten automáticamente a USD/VES.

## 2. Ejecutar el contrato

1. Desde un presupuesto emitido, **Continuar con el contrato**, o abra **Contratos y ejecución → Activar contrato**. Confirme obra, código, plazo y condiciones: moneda de origen, impuesto, anticipo autorizado, amortización y retención.
2. El expediente conserva la línea base de partidas y precios del presupuesto emitido. Una orden de cambio aprobada modifica cantidades o precios por vigencia; también puede incorporar partidas adicionales. No reescribe períodos emitidos.
3. **Cómputos métricos** ofrece longitud, área, volumen y conteo, con dimensiones, repeticiones, factor, conversión explícita y ubicación. Un cómputo aprobado puede respaldar una medición, un cambio o transferirse a un borrador de presupuesto de la misma obra mediante vista previa y confirmación.
4. **Mediciones** registra partida, fecha de ejecución, unidad, ubicación, referencia única y evidencia. El flujo es borrador → revisión → aprobación/devolución. Las correcciones identifican la medición anterior; las cantidades negativas están acotadas por su origen.
5. **Valuaciones** selecciona cantidades aprobadas disponibles. Puede incluir saldos de mediciones anteriores mediante arrastre explícito. Muestra contratado, anterior, actual, acumulado y saldo; aplica el precio vigente en la fecha de ejecución y conserva el detalle de asignación.
6. Los impuestos respetan las partidas gravadas. La amortización está limitada al anticipo desembolsado pendiente. Las retenciones se muestran aparte. Las reversiones identifican la valuación corregida y preservan sus fuentes y precios.
7. La emisión verifica otra vez saldos y permisos dentro de la transacción. Dos emisiones simultáneas no pueden asignar la misma cantidad dos veces.
8. **Cronograma** permite actividades, fechas, predecesoras, pesos y reprogramaciones aprobadas. Se rechazan ciclos y pesos que no sumen 100 %. Se distinguen avance físico ponderado, planificado y económico.

## 3. Reconsiderar, conciliar y cerrar

1. Registre y apruebe **Índices** con serie, fecha, fuente y respaldo. Revisar una observación identifica su publicación anterior. El perfil inicial trabaja con observaciones mensuales.
2. Apruebe un **Perfil de ajuste**: fórmula polinómica versionada, fecha base, vigencia, término fijo, series, coeficientes y partidas elegibles. Los coeficientes y el fijo deben sumar 1. Indique si el contrato permite diferencias negativas y si el ajuste lleva impuesto, retención y amortización.
3. Prepare una **Reconsideración** sobre una valuación emitida. La vista previa conserva índices base y del período, coeficientes, factor y diferencia. Su emisión impide aplicar dos veces el mismo alcance. Una corrección enlazada aplica únicamente el efecto incremental.
4. **Anticipos y pagos** registra desembolsos, devoluciones de anticipo, liberaciones de retención y pagos con comprobantes. Son registros de conciliación: no ejecutan transferencias bancarias ni suponen integración contable automática.
5. En **Resumen y conciliación**, el corte muestra cantidades originales/vigentes, medidas, valuadas, saldos, importes y documentos de origen. El corte administrativo puede ser posterior al plazo de ejecución.
6. Prepare el **Cierre** después de resolver documentos de ejecución pendientes. Cada diferencia residual exige motivo, responsable, condición y evidencia; las obligaciones posteriores quedan identificadas. La emisión verifica que las fuentes de la vista previa no hayan cambiado.
7. El cierre emitido queda inmutable y bloquea nuevos movimientos. **Abrir rectificación** exige autorización y motivo; el cierre sucesor referencia al anterior y conserva o amplía el corte.

## Anexos, reportes y permisos

Los documentos de obra tienen PDF/Excel por revisión. Las valuaciones incluyen cantidades e importes, mediciones de origen y conceptos; el cierre incluye cuadro de cantidades, importes/saldos, resoluciones y expediente fuente. La hoja Excel conserva decimales como texto y los PDF usan fuente incrustada.

Los archivos adjuntos usan el módulo Documentos de planta y sus permisos. Cada evidencia interna conserva número de versión y checksum; subir otra versión no reemplaza la prueba usada por un documento anterior. Las evidencias de resoluciones de cierre también se comprueban contra la planta. Los enlaces externos son referencias, no copias archivadas de su contenido.

Se utilizan `budget.read`, `budget.edit`, `budget.approve` y `document.upload/read`. La API verifica pertenencia a planta/contrato en consultas, modificaciones y descargas. Las escrituras de documentos usan revisión esperada; aprobaciones y emisiones tienen claves de reintento y auditoría.

## Verificación y condiciones de uso real

Las pruebas automatizadas cubren el recorrido obra → presupuesto emitido → contrato → aumento → dos períodos de valuación → reconsideración → conciliación → cierre → rectificación. También comprueban importación, aislamiento entre plantas, precios por vigencia, pendientes, concurrencia y evidencia versionada. Se verifica el ejemplo de cierre: 2.750,00 bruto + 50,00 de ajuste − 300,00 de amortización − 137,50 de retención = 2.362,50 neto, con impuesto cero en ese caso de prueba.

Estas pruebas usan datos identificados como pruebas. La aceptación de un presupuesto/contrato real requiere que sus responsables confirmen precios, fechas, índices, coeficientes y condiciones. No se afirma paridad con todas las fórmulas ni todos los reportes de LuloWin 2018. No se agregaron pagos bancarios, índices oficiales automáticos ni conversiones monetarias implícitas.

Migraciones aditivas: `0050_lulo_work_lifecycle` a `0054_lulo_contract_taxable`. Las tablas anteriores y los presupuestos previos se conservan en **Presupuestos anteriores**; el recorrido nuevo continúa desde su propio presupuesto emitido.
