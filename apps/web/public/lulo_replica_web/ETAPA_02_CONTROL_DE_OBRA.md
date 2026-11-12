# Etapa 2. Control de obra

[Índice de implementación](INDICE_IMPLEMENTACION_LULO_WEB.md) · [Etapa 1](ETAPA_01_PRESUPUESTACION.md) · [Etapa 3](ETAPA_03_RECONSIDERACIONES_Y_CIERRE.md)

## Objetivo y entrada

Controlar qué cantidad se contrató, qué se ejecutó, cuánto se ha valuado y qué queda pendiente. La entrada es un presupuesto emitido de la etapa 1 que un usuario autorizado selecciona como línea base del contrato. El presupuesto de origen conserva su numeración y sus APU. El contrato controla las cantidades y precios efectivamente pactados.

La etapa entrega una línea base contractual, cómputos métricos, mediciones aprobadas, órdenes de cambio, valuaciones por período y seguimiento del cronograma. El equipo puede consultar el avance por obra, capítulo, partida o activo vinculado.

## Casos de uso y actores

| Caso | Actor | Flujo y resultado |
| --- | --- | --- |
| CO01. Activar contrato | Responsable contractual | Selecciona una versión emitida, confirma moneda, fechas, condiciones y partidas. El sistema fija la línea base y su origen. |
| CO02. Documentar cómputos | Presupuestista o técnico | Registra dimensiones, unidad, fórmula y ubicación. Un cómputo aprobado puede respaldar una cantidad de presupuesto en borrador o una variación contractual. |
| CO03. Registrar medición | Técnico de campo | Selecciona partida y ubicación, ingresa cantidad y adjunta evidencia. Envía a revisión. |
| CO04. Aprobar medición | Supervisor | Contrasta cantidades, unidad, evidencia y vigencia de la partida. Aprueba o devuelve con observaciones. |
| CO05. Aprobar orden de cambio | Responsable contractual | Revisa aumentos, disminuciones, nuevas partidas y precios. Al aprobar se actualiza el saldo contractual desde la vigencia indicada. |
| CO06. Preparar y emitir valuación | Presupuestista y revisor | Seleccionan mediciones aprobadas del período, verifican saldos y conceptos y emiten el documento. |
| CO07. Revisar cronograma | Planificador | Mantiene actividades, dependencias y línea base. Compara avance planificado con las mediciones aprobadas. |
| CO08. Corregir ejecución emitida | Responsable contractual | Crea un ajuste posterior con referencia al documento original y motivo. El historial permite reconstruir el efecto. |

## Backend y modelo de datos

| Entidad | Datos mínimos y controles |
| --- | --- |
| Contrato | Obra, versión de presupuesto emitida, moneda, fechas, revisión, estado y perfil de valuación. |
| Partida contractual | Contrato, identificador estable, renglón de origen si existe, código, unidad, cantidad base y precio acordado. |
| Vigencia de precio contractual | Partida, precio, fecha de inicio, orden aprobada de origen y revisión. Resolver la fecha aplicable según el contrato. |
| Cómputo y detalle | Partida, revisión, estado, ubicación, tipo de fórmula, dimensiones, factor, resultado, unidad y adjuntos. |
| Medición | Contrato, partida, fecha de ejecución, ubicación, cantidad, unidad, evidencias, estado, autor y aprobador. |
| Orden de cambio y detalle | Contrato, número, vigencia, estado, motivo, partida, tipo de movimiento, cantidad, precio cuando corresponda y aprobador. |
| Valuación y detalle | Contrato, período, número, estado, revisión, partida, cantidad anterior, actual y acumulada, precio copiado, importe y saldos. |
| Asignación de medición | Medición, detalle de valuación, cantidad y estado. Permite rastrear consumos y prevenir doble asignación. |
| Concepto de valuación | Tipo, origen, signo, base, tasa, monto, orden y saldo asociado. Incluye impuestos, amortizaciones y retenciones según contrato. |
| Actividad y dependencia | Contrato, partida opcional, fecha planificada, duración, predecesora, avance y versión del plan. |

Todas las relaciones de escritura validan organización y contrato. Usar decimales para cantidades y dinero. Indexar mediciones por contrato, estado y fecha, y valuaciones por contrato, estado y período. Las operaciones de aprobación y emisión usan control de revisión y transacciones. Las copias emitidas conservan precios, bases, fechas, cantidades y reglas efectivamente aplicadas.

## Reglas de negocio

1. **Línea base.** Al activar el contrato, copiar las partidas pactadas desde la versión emitida. Guardar su referencia. Definir la numeración contractual, la unidad de cada partida, el perfil de cálculo y la moneda.
2. **Cómputos.** Admitir fórmulas controladas como longitud, área rectangular, volumen rectangular y conteo. Cada fórmula exige sus dimensiones y unidades. Guardar conversiones explícitas y el resultado. Transferir un cómputo aprobado a un borrador mediante confirmación que muestra cantidad anterior y nueva.
3. **Mediciones.** Usar BORRADOR → EN_REVISION → APROBADA. La devolución reactiva el borrador y registra motivo. Verificar que la fecha corresponda al contrato y que la cantidad use su unidad. Una medición aprobada con saldo disponible puede asociarse al período correspondiente.
4. **Variaciones.** La orden de cambio separa aumentos, disminuciones, partidas nuevas y modificaciones de precio. Una partida nueva requiere unidad, alcance, cantidad y precio acordado. Al aprobar, aplicar todos sus movimientos juntos. Una disminución que dejaría el contrato por debajo de la cantidad ya valuada exige resolver el ajuste antes de aprobar.
5. **Selección para valuación.** Aplicar el corte del período y el perfil del contrato. Mostrar cantidad aprobada, asignada y disponible. Una misma cantidad de una medición se consume una vez. Si se permiten asignaciones parciales, su suma emitida no puede superar la medición aprobada. Una previsualización se vuelve a validar al emitir.
6. **Cálculo.** Cantidad vigente = base + aumentos aprobados − disminuciones aprobadas a la fecha de corte. Cantidad acumulada = anterior emitida + actual. Saldo = vigente − acumulada. Bloquear excedentes y conflictos con cortes emitidos. Calcular importe por partida y por vigencia de precio cuando el período abarque más de una. Usar el perfil del contrato para redondeo, impuestos, anticipos y retenciones.
7. **Emisión.** Validar revisión, permisos, vigencias, elegibilidad, saldos y período en la misma transacción que registra asignaciones, numeración y auditoría. Un reintento con la misma clave devuelve la emisión ya creada. Mantener trazabilidad por renglón y documento de campo.
8. **Cronograma.** Guardar versión planificada y reprogramaciones aprobadas. Detectar ciclos en dependencias. Mostrar avance físico por partida y avance económico por valuación emitida como métricas separadas. Para un porcentaje global, definir pesos y base de cálculo antes de publicar el indicador.

Ejemplo de aceptación. Con 100 unidades base, 10 de aumento, 30 valuadas antes y 20 en el período, la cantidad contractual vigente es 110, el acumulado 50 y el saldo 60. Si el precio aplicable es 25,00, el importe bruto del período es 500,00. El siguiente período toma 50 como cantidad anterior.

## API y frontend

| Operaciones bajo `/api/v1/presupuestos/contratos/{id}` | Pantalla y acción |
| --- | --- |
| `GET /resumen`, `POST /activar` | Ficha contractual, presupuesto de origen, saldo y estado. |
| `GET/POST /computos`, `POST /computos/{id}/aprobar` | Editor de dimensiones con cálculo por línea y evidencia. |
| `GET/POST /mediciones`, `PATCH /mediciones/{id}`, `POST /mediciones/{id}/enviar`, `/aprobar` y `/devolver` | Captura de campo y bandeja de revisión. |
| `GET/POST /cambios`, `POST /cambios/{id}/aprobar` | Comparativo antes y después por partida y precio. |
| `GET/POST /valuaciones`, `POST /valuaciones/{id}/previsualizar`, `/enviar`, `/devolver` y `/emitir` | Selección de mediciones, cálculo, revisión, emisión e impresión. |
| `GET/PUT /cronograma`, `GET /avance` | Plan de actividades y comparación con avance real. |

Aplicar los códigos de error y el control de revisión de la etapa 1. Cada pantalla permite llegar a la partida contractual y al documento de origen. En el editor de valuaciones mostrar lado a lado cantidades contratadas, anteriores, del período, acumuladas y saldo. Indicar la base de cada deducción y el monto neto. Los totales oficiales proceden de la API.

## Orden de implementación y aceptación

1. Crear contratos, partidas y vigencias desde un presupuesto emitido.
2. Implementar captura de cómputos, mediciones y evidencias. Probar revisión y devolución.
3. Implementar cambios contractuales y saldo vigente con vigencia y auditoría.
4. Implementar preparación, emisión y reporte de valuaciones. Verificar concurrencia y reintentos.
5. Agregar cronograma, avance y comparativos de cantidades. Ejecutar dos períodos piloto.

La etapa se acepta cuando dos períodos consecutivos concilian. Probar además una orden de aumento, una disminución incompatible, una medición duplicada, una corrección posterior, un cambio de precio con fecha de vigencia, una solicitud simultánea sobre la misma medición y una exportación con los mismos totales que la pantalla. Para la etapa 3 quedan disponibles la línea base, los movimientos aprobados, las asignaciones y las valuaciones emitidas.
