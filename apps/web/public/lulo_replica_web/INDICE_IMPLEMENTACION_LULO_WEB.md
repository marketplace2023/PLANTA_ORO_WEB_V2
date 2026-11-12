# Implementación de LULO Web en tres etapas

Para reproducir el alcance completo del original, empieza por la [especificación de equivalencia de LuloWin NG 2018](ESPECIFICACION_EQUIVALENCIA_LULOWIN_NG_2018.md). Las etapas son el orden de implementación. Las fichas de equivalencia amplían sus funciones, variantes y pruebas.

| Etapa | Objetivo | Documento | Requisito para avanzar |
| --- | --- | --- | --- |
| 1. Presupuestación | Preparar obras, administrar maestros, calcular APU y emitir presupuestos por capítulos. | [Guía técnica de Presupuestación](ETAPA_01_PRESUPUESTACION.md) | Presupuesto piloto emitido, cálculo y reportes conciliados, y versión elegida como línea base contractual. |
| 2. Control de obra | Medir avances, aprobar variaciones, valorar lo ejecutado y seguir el cronograma. | [Guía técnica de Control de obra](ETAPA_02_CONTROL_DE_OBRA.md) | Dos períodos consecutivos conciliados y trazables, con cantidades, importes y saldos verificables. |
| 3. Reconsideraciones y cierre | Liquidar ajustes aprobados, conciliar documentos y emitir el cuadro de cierre. | [Guía técnica de Reconsideraciones y Cierre](ETAPA_03_RECONSIDERACIONES_Y_CIERRE.md) | Cierre emitido con respaldo documental, diferencias resueltas y tratamiento explícito de saldos pendientes. |

La primera guía incluye el mapa general de las tres entregas. Para implementar la segunda y la tercera, usar las reglas y criterios de aceptación de sus documentos respectivos.

El objetivo final es poder seguir cada importe desde el presupuesto original hasta el cierre, pasando por el contrato, las mediciones, las variaciones, las valuaciones y los ajustes. La versión emitida y aprobada como base contractual enlaza las dos primeras etapas. Los documentos de ejecución emitidos alimentan la tercera.

**Recursos de la primera etapa**

- [Especificación funcional y casos de uso](ESPECIFICACION_MVP.md)
- [Motor de cálculo de referencia](motor_presupuesto.py)
- [Presupuesto de ejemplo](ejemplo_presupuesto.json)

**Decisiones para el piloto.** Confirmar el perfil de cálculo de APU con presupuestos de referencia, quién aprueba cada documento y las condiciones particulares de cada contrato. Las bases de impuesto, los índices de reconsideración, los límites de ejecución y el tratamiento de anticipos o retenciones requieren reglas configuradas y aprobadas antes de su uso en producción.
