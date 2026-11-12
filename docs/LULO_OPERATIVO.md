# Presupuestos LULO: cálculo, acceso público y planta

**Recorrido vigente:** [Implementación de las tres etapas](LULO_TRES_ETAPAS.md), con obras, contratos, mediciones, valuaciones, reconsideraciones y cierre en planta.

**Corrección vigente:** consulte [Maestros originales en home y panel de planta](LULO_MAESTROS_EN_PLANTA.md). El flujo operativo se trasladó al panel de planta 5174 y el home ahora abre los maestros reales convertidos. La explicación de activación administrativa y ejemplo piloto de este documento describe la implementación anterior y ya no es el recorrido de entrada.

Implementación operativa inicial de L2/L3/L4 del plan, noviembre de 2026. Usa la API NestJS, PostgreSQL/Drizzle, la identidad FUR y los permisos existentes. No declara equivalencia completa con LuloWin 2018 ni sustituye el alcance posterior de control de obra, reconsideraciones y cierre.

## Recorrido visible

1. Desde el home, abra **Crear una estimación**, o visite `/budgets`. La ruta y sus endpoints específicos son públicos, incluso con `ACCESS_MODE=members`.
2. Use **Cargar ejemplo completo** para recorrer un caso de aceptación, o empiece en blanco. El ejemplo está marcado como demostración con datos ficticios en pantalla, PDF y Excel. Su PU es 137,94; subtotal 3.948,50; impuesto ilustrativo 631,76; total 4.580,26 USD. Coincide con el caso del motor Python entregado.
3. Seleccione una biblioteca publicada, busque APU y agregue cantidades. Puede crear capítulos/subcapítulos, partidas manuales y precios asumidos con un motivo; registrar ajustes propios de precios de insumos y definir porcentajes de FCAS, administración, utilidad, financiamiento e impuesto.
4. Calcule para actualizar los importes. El resultado siempre lo produce el servidor. Una respuesta que termine después de otra edición no se presenta como cálculo de los valores nuevos.
5. El borrador público se conserva en el navegador. No se guardan presupuestos privados de planta en `localStorage`. Si inicia sesión desde el editor, vuelve a `/budgets` y recupera el borrador.
6. Con sesión y `budget.edit`, seleccione **Guardar en planta**. También puede empezar desde `/plants/:slug/budgets`, pestaña **Presupuestos LULO**. El servidor adopta el contenido recalculándolo y crea su copia de catálogo y precios; no acepta un total enviado por el cliente.
7. En un presupuesto de planta: edite y guarde con motivo; envíe a revisión; quien tenga `budget.approve` puede devolverlo o emitirlo. Un presupuesto emitido conserva entrada, composición, precios, moneda, parámetros y resultado. La modificación posterior se hace mediante **Crear nueva versión**, enlazada a la emisión anterior.

Los presupuestos anteriores, APU, recursos y tablero siguen disponibles en las otras pestañas del módulo. Mantienen sus tablas y motor original; no se recalculan automáticamente con las reglas nuevas.

## Catálogo compartido y precios reales

Los maestros del MDB se convirtieron en tablas relacionales y se consultan directamente en home y planta. Su consulta y uso referencial no requieren aprobar un piloto en Admin. Los precios vigentes y ajustes propios se gestionan en planta; véase el recorrido actualizado enlazado arriba. El mecanismo administrativo de versiones descrito a continuación se conserva como antecedente técnico.

Esta activación es distinta de publicar una revisión interna. El endpoint público proyecta únicamente los datos de catálogo necesarios: no entrega filas originales del MDB, proyectos fuente, datos de actores ni evidencia interna de verificación. Los criterios de composición publicados deben ser aptos para consulta pública.

Puede retirar una publicación para nuevos trabajos. Los presupuestos que ya guardaron sus precios siguen siendo legibles y calculables con su copia. Una ampliación que requiera nuevos APU necesita una publicación disponible; los documentos emitidos y sus reportes siempre usan el resultado almacenado.

La demostración usa un lote independiente con origen `DEMO`, separado del MDB. Sus publicaciones conservan la condición de demostración al activarse; no se convierten en tarifas comerciales. No se asignó una moneda vigente ni un precio actual por defecto a los maestros originales.

## Motor `FUR_LULO_MVP_1`

- Aritmética con `decimal.js`, precisión de 60 dígitos y redondeo `ROUND_HALF_UP`. Entradas e importes se intercambian como cadenas decimales, sin redondeos binarios de `number`.
- Materiales: cantidad × precio × (1 + desperdicio / 100).
- Equipo y mano de obra: consumo por unidad, por hora o por jornada según el rendimiento declarado; se convierten tarifas H/DIA únicamente con jornada explícita cuando sea necesaria.
- FCAS se aplica a mano de obra. Administración sobre directo; utilidad sobre directo + administración; financiamiento sobre directo + administración + utilidad.
- El PU se redondea a los decimales de moneda elegidos antes de multiplicar por la cantidad. Se suman importes de partidas; el impuesto se calcula sobre la base gravada y se redondea al mismo nivel.
- Los coeficientes de adquisición/depreciación del legado no se aplican otra vez a una tarifa de uso ya verificada.
- No hay conversión monetaria implícita. Una estimación usa una moneda y denominación compatibles con su biblioteca.
- El modo asumido conserva el APU como referencia y registra otro precio adoptado. Su composición no se presenta como consumo físico real; la relación de insumos corresponde a partidas calculadas.

Las fórmulas del motor anterior permanecen identificadas por su funcionamiento actual. Las nuevas reglas no se imponen sobre presupuestos históricos.

## Precios guardados y recálculo

Cada documento de planta guarda su copia de los APU usados, incluyendo precios y vigencias de sus insumos. Editar cantidades o leer un documento no consulta precios maestros para reemplazarlos.

**Actualizar precios desde una publicación** permite elegir los APU, obtener una vista previa del total y confirmar el recálculo con una huella. Un cambio de revisión invalida la confirmación anterior. Los APU no seleccionados conservan sus componentes anteriores; los ajustes privados se conservan. Cada APU mantiene la identidad de su publicación de origen en la copia.

La vigencia se comprueba contra la fecha UTC del servidor. Un borrador antiguo puede leerse y editarse con advertencias de vigencia, pero debe tener precios vigentes para enviarse y emitirse. Los PDF/Excel de documentos emitidos conservan el resultado histórico aunque un precio venza después.

## Revisión, emisión y permisos

Estados: `DRAFT → IN_REVIEW → ISSUED`; devolución de revisión a borrador con motivo. Las transiciones y cambios usan bloqueo de fila y revisión esperada. Un segundo guardado de una revisión obsoleta recibe `409`.

- `budget.read`: listado, detalle, historial y reportes de la planta autorizada.
- `budget.edit`: crear/adoptar, corregir borradores, calcular, actualizar precios, enviar a revisión y crear versiones sucesoras.
- `budget.approve`: devolver o emitir un documento en revisión.
- Administración global: revisar y activar/retirar publicaciones del catálogo.

La adopción y creación de sucesores son idempotentes por solicitud y planta. Una solicitud reutilizada para otro contenido se rechaza. Los eventos de creación, guardado, recálculo, revisión, devolución, emisión y sucesión usan `audit.events`.

## Reportes

Cuatro salidas disponibles en PDF y Excel: presupuesto, resumen de capítulos, hoja de APU y relación de insumos. Usan el mismo resultado canónico que la pantalla. Indican estado, moneda, versión, perfil, parámetros, base de precios y huella. Los documentos públicos son preliminares; la demostración lleva su marca sin validez comercial.

El Excel conserva decimales como texto para evitar pérdida de precisión y contiene una hoja de datos exactos. El PDF usa Noto Sans con su licencia OFL, fuente incrustada y paginación. Los reportes de planta se descargan con sesión; no se publican archivos privados en una carpeta estática.

## Despliegue y prueba local

La migración aditiva es `0048_lulo_operational.sql`. Agrega publicaciones y documentos LULO sin alterar presupuestos anteriores. Las dependencias de ejecución son `decimal.js`, `pdfkit` y `exceljs`; la fuente para PDF se incluye en los assets de Nest.

```powershell
npm install
npm run db:migrate -w @fur/api
npm run lulo:demo -w @fur/api
```

El comando de demostración solo admite `fur_dev` local y es idempotente. No ejecuta semillas del proyecto antiguo ni publica obras de origen. Se ejecutó en la base local de desarrollo.

Pruebas principales: `lulo-engine.spec.ts`, `lulo-reports.spec.ts`, `lulo-operational.e2e.spec.ts`, pruebas del editor web y regresiones del motor/presupuestos anteriores. El recorrido de integración cubre visitante, dos plantas privadas, editor, lector, gerente y administrador, así como precios privados, retiro de publicación, actualización explícita, reportes y sucesión de versiones.

## Endpoints

Públicos: `GET /budget-estimates/publications`, `GET /budget-estimates/publications/:id/apus`, `GET /budget-estimates/example`, `POST /budget-estimates/calculate` y `POST /budget-estimates/report`. Cálculo y reportes usan `Cache-Control: no-store`; las rutas públicas tienen límites de frecuencia y de tamaño/estructura.

Privados: `/plants/:plantId/lulo/documents`, detalle por ID, `preview`, `submit`, `return`, `issue`, `revisions`, `recalculate-preview`, `recalculate` y `report`.

Administración: `GET /admin/budget-catalog/publications`, `POST /admin/budget-catalog/releases/:id/activate` y `POST /admin/budget-catalog/publications/:id/withdraw`.
