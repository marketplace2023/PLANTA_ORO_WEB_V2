# Etapa 3. Reconsideraciones y cierre de obra

[Índice de implementación](INDICE_IMPLEMENTACION_LULO_WEB.md) · [Etapa 1](ETAPA_01_PRESUPUESTACION.md) · [Etapa 2](ETAPA_02_CONTROL_DE_OBRA.md)

## Objetivo y entrada

Emitir el cuadro de cierre de la obra con cantidades, importes, ajustes y saldos trazables. La entrada es un contrato con línea base, cambios aprobados, mediciones y valuaciones emitidas. El cierre compara lo contratado con lo ejecutado y documenta el tratamiento de diferencias, anticipos, retenciones y ajustes.

La reconsideración se aplica cuando el contrato la contempla. Su fórmula, índices, períodos y conceptos elegibles deben provenir de un perfil contractual aprobado. El alcance inicial admite casos parametrizados y validados por el responsable de la obra.

## Casos de uso y actores

| Caso | Actor | Flujo y resultado |
| --- | --- | --- |
| CI01. Registrar índices y perfil | Administrador de costos | Carga las series y fuentes, define vigencias y somete el perfil contractual a aprobación. |
| CI02. Preparar reconsideración | Analista de costos | Selecciona valuación y partidas elegibles. Revisa índices base y del período, coeficientes, fórmula y diferencia. |
| CI03. Aprobar y emitir ajuste | Revisor | Valida bases y fuentes. Emite un ajuste vinculado a la valuación y a la regla aplicada. |
| CI04. Conciliar ejecución | Responsable de obra | Compara cantidades base, cambios, medidas, valuadas y pendientes. Registra resolución para las diferencias. |
| CI05. Conciliar saldos | Responsable administrativo | Revisa anticipos, amortizaciones, retenciones, liberaciones, pagos y documentos de respaldo según el alcance contratado. |
| CI06. Emitir cierre | Responsable autorizado | Confirma fecha de corte, conciliación y anexos. El sistema fija el cuadro y su expediente. |
| CI07. Rectificar cierre | Responsable autorizado | Abre una revisión con motivo y referencia al cierre anterior, según el procedimiento contractual. |

## Backend y datos

| Entidad | Datos mínimos y controles |
| --- | --- |
| Serie de índice y observación | Código, familia, fuente, fecha, valor, revisión, estado y evidencia. La revisión publicada queda disponible históricamente. |
| Perfil de reconsideración | Contrato, versión de fórmula, vigencia, período base, familias, coeficientes, partidas elegibles, precisión y aprobación. |
| Reconsideración y detalle | Contrato, valuación y renglón de origen, período, estado, base elegible, índices copiados, coeficientes, factor, diferencia, fuentes y revisión. |
| Movimiento de saldo | Contrato, concepto, documento de origen, fecha, signo, importe, moneda y saldo relacionado. Referenciar anticipos, amortizaciones, retenciones o liberaciones. |
| Cierre y corte | Contrato, fecha de corte, número, revisión, estado, autor, aprobador, fuentes y huella de la copia emitida. |
| Detalle de cierre | Partida, cantidades y montos de línea base, variaciones, contrato vigente, ejecución y saldo, con referencias a los documentos que forman cada subtotal. |
| Diferencia de conciliación | Cierre, tipo, origen, valor, estado, evidencia y resolución aprobada. |
| Anexo de cierre | Documento, tipo, origen, versión, archivo o referencia de acceso y permisos. |

Usar las entidades y permisos de las etapas anteriores. Conservar los documentos y parámetros aplicados en cada ajuste. La conciliación debe usar solo documentos autorizados y vigentes hasta la fecha de corte. Implementar una revisión de corte o huella de documentos fuente para detectar cambios entre la vista previa y la emisión.

## Reglas de reconsideración

1. Seleccionar una valuación emitida y el perfil contractual efectivo. Comprobar moneda, período, partidas elegibles y que el perfil esté aprobado.
2. Resolver las observaciones publicadas para el período base y el período aplicable. Bloquear cálculo si falta un índice, si la base es cero cuando la fórmula divide por ella o si el coeficiente queda fuera de lo autorizado.
3. Aplicar la fórmula versionada. Si el contrato usa un factor polinómico, cada término usa el coeficiente aprobado y la relación índice del período / índice base. Si existe componente fijo, conservarlo como término separado. Las reglas de suma de coeficientes y elegibilidad forman parte del perfil.
4. Mostrar base elegible, términos, factor y diferencia antes de emitir. Si el perfil define diferencia = base elegible × (factor − 1), aplicar el redondeo contractual y admitir el signo resultante según contrato.
5. Emitir un ajuste asociado a la valuación y a sus renglones. Controlar unicidad por origen, período, alcance y perfil efectivo para evitar doble aplicación. Un ajuste correctivo referencia al anterior y registra su efecto incremental. El ajuste emitido se conserva como documento separado.

Ejemplo de prueba para un perfil ilustrativo. Base elegible 500,00 y factor aprobado 1,10 producen una diferencia de 50,00. El sistema muestra ambos valores y conserva el origen de cada índice aplicado. El ejemplo prueba la mecánica del motor, con valores de demostración.

## Reglas de conciliación y cierre

1. **Fijar corte.** Elegir fecha, contrato y documentos de origen. Construir una vista previa de partidas, mediciones, cambios, valuaciones, ajustes y movimientos de saldos.
2. **Conciliar cantidades.** Por partida, mostrar cantidad original, aumentos, disminuciones, vigente, medida aprobada, valuada y saldo. Una diferencia entre medida y valuada exige regularización o resolución contractual documentada. Conservar cantidad y motivo en el cuadro.
3. **Conciliar importes.** Mostrar original, variaciones, contratado actualizado, bruto ejecutado, reconsideraciones, impuestos, amortizaciones y retenciones. Mantener las bases, signos y períodos del documento de origen. Comparar importes con reportes emitidos. El total contractual y el total ejecutado se muestran como conceptos distintos.
4. **Conciliar saldos.** Saldo de anticipo = desembolsado − amortizado − devoluciones aplicables. Saldo de retención = retenido − liberado − aplicaciones aprobadas. Aplicar signos y vigencias del contrato. Las obligaciones que continúan después del cierre físico deben quedar identificadas con importe, responsable y condición de liquidación.
5. **Separar emisión y pago.** La valuación emitida acredita un importe documentado. El saldo por pagar se calcula con movimientos de pago conciliados. Cuando no hay integración de pagos, presentar la conciliación de lo valuado e identificar el saldo de pagos como pendiente de confirmación.
6. **Resolver pendientes.** Antes de cerrar, revisar cambios, mediciones, valuaciones, ajustes y conciliaciones abiertos al corte. Bloquear los pendientes que afectan el cierre. Una diferencia aceptada debe tener motivo, evidencia y autorización.
7. **Emitir y conservar.** Validar corte, revisión, permisos y conciliación en una transacción. Fijar número, fecha, partidas, fuentes, totales, saldos y anexos. Un reintento con la misma clave recupera el cierre ya emitido. La rectificación crea una versión vinculada y registra motivo.

Ejemplo acumulado. Tres valuaciones brutas de 750,00, 500,00 y 1.500,00 suman 2.750,00. Con un ajuste aprobado de +50,00, amortización de 300,00 y retención de 137,50, el neto documentado es 2.362,50, con impuesto cero para este ejemplo. El reporte presenta por separado el saldo de anticipo y el saldo de retención, y usa los movimientos de pago para conciliar lo efectivamente pagado.

## API y frontend

| Operación | Pantalla y acción |
| --- | --- |
| `GET/POST /indices`, `POST /indices/{id}/publicar` | Series, períodos, fuentes e historial de revisiones. |
| `GET/POST /contratos/{id}/perfiles-reconsideracion` | Configuración y aprobación de la regla contractual. |
| `GET/POST /contratos/{id}/reconsideraciones`, acciones `previsualizar`, `aprobar` y `emitir` | Comparativo de valor original y reajustado, detalle de fórmula y evidencia. |
| `GET /contratos/{id}/conciliacion?corte=...` | Matriz de cantidades, importes, saldos y pendientes con enlaces a sus documentos. |
| `POST /contratos/{id}/cierres`, acciones `previsualizar`, `resolver-diferencia`, `emitir` y `rectificar` | Asistente de cierre, revisión de diferencias, emisión y expediente histórico. |
| `GET /cierres/{id}/reportes/cuadro-cierre` y `/demostrativo-cantidades` | Consulta, impresión y exportación de la versión emitida. |

Usar permisos por contrato y revisión esperada en toda escritura. En la pantalla de conciliación permitir navegar desde una cifra al renglón y a sus documentos fuente. Mostrar la fecha de corte, el estado y la versión en pantalla y reportes. Presentar las resoluciones y los saldos pendientes dentro del expediente.

## Orden de implementación y aceptación

1. Implementar series, fuentes y perfil aprobado de reconsideración. Verificar el cálculo contra ejemplos del contrato.
2. Implementar vista previa, emisión y correcciones de ajustes. Probar índice faltante, índice revisado, signo negativo permitido y duplicidad.
3. Construir conciliación por partida y por concepto de saldo. Probar cortes, disminuciones y ajustes posteriores al corte.
4. Implementar resolución de diferencias, cierre inmutable, rectificación y reportes. Probar un cambio en documentos fuente entre vista previa y emisión.
5. Ejecutar cierre piloto y revisar con costos, obra y administración. Verificar que la suma de detalles coincide con encabezados, que los saldos pendientes están justificados y que cada cifra puede rastrearse hasta su documento de origen.

La entrega se acepta con el cuadro de cierre, el demostrativo de cantidades y el expediente de respaldo de una obra piloto. La versión emitida debe poder reproducirse desde las fuentes que quedaron fijadas al corte.
