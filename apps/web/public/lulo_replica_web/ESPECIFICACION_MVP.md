# Presupuestos y análisis de precios unitarios para la web

El módulo **Presupuestos (LULO)** permite preparar y emitir un presupuesto de obra, consultar cómo se forma cada precio y reutilizar partidas e insumos. Puede usarse para cotizar trabajos de una planta de beneficio, desde un montaje hasta una intervención de mantenimiento.

## Qué se encontró en LuloWin

| Función | Evidencia en el manual |
| --- | --- |
| Catálogos de materiales, equipos y mano de obra | Páginas impresas 105–176. Cada clase tiene su forma de registrar el costo. |
| Partidas reutilizables y sus insumos | 177–237. La partida tiene código, descripción, unidad y rendimiento. Los materiales se registran por unidad de obra y los equipos y la mano de obra por rendimiento diario. |
| Obras y parámetros | 238–282. Datos de la obra, factores asociados al salario, indirectos, bonos, impuestos y anticipos o retenciones. |
| Presupuestos con APU y sin APU | 302–342. La partida puede calcularse a partir de insumos o tener un precio unitario ingresado. La pantalla con APU también admite precio asumido. |
| Recálculo selectivo | 321–323 y 682–686. Es posible actualizar estructura, parámetros o costos por clase de insumo y comparar el total anterior con el nuevo. |
| Salidas de presupuesto | 521–547. Hoja de APU, presupuesto estándar y presupuesto por capítulos. |
| Ejecución y cierre de obra | 343–509 y 559–668. Aumentos, disminuciones, mediciones, cómputos, valuaciones, reconsideraciones y cierre. Se plantean como ampliación posterior. |
| Intercambio | 705–718. Carga de insumos y de presupuestos, y exportación de presupuestos en Excel. El MVP puede comenzar con CSV. |

Las páginas son las impresas en la edición del manual de 2012. En el PDF su posición es una página más adelante. El instalador entregado corresponde a 2018. Se revisaron el manual, la base de datos y el menú de reportes del paquete. Las reglas de cálculo de esta especificación son explícitas para el MVP. La equivalencia exacta con los cálculos internos de 2018 queda pendiente de contrastar con presupuestos de referencia de una instalación operativa.

## Alcance de la primera versión

**Incluye** obras, clientes, maestros de insumos y partidas, capítulos, presupuestos con y sin APU, precios asumidos justificados, recálculo voluntario, versiones y reportes de presupuesto y APU. La pantalla de partidas puede mostrar el vínculo con el catálogo de activos físicos mediante el TAG, con etapa y red como datos de contexto.

**Siguiente entrega** cómputos métricos y mediciones, valuaciones acumuladas, aumentos y disminuciones, comparativo de versiones, cronograma, reconsideraciones por índices y cierre. Las plantillas especiales de reportes y las variantes de impuestos y FCAS se revisan con casos reales antes de incorporarlas.

## Pantallas y permisos propuestos

| Pantalla | Qué necesita hacer el usuario |
| --- | --- |
| Obras | Buscar por código, cliente o estado y abrir la obra. Ver su presupuesto actual y versiones emitidas. |
| Presupuesto | Crear capítulos, insertar partidas, editar cantidades y elegir el origen del precio. Ver subtotales e impuesto. |
| Editor de APU | Agregar insumos por tipo, revisar unidad y costo, editar rendimiento, desperdicio y factores aplicados. Mostrar precio calculado, asumido y vigente de forma diferenciada. |
| Maestros | Buscar y administrar insumos, precios, partidas modelo, clientes y proveedores. |
| Recalcular | Elegir el alcance, ver las partidas afectadas y comparar montos antes de confirmar. |
| Emisión y consulta | Revisar el presupuesto, emitir una versión y descargar o imprimir presupuesto y hojas de APU. |

Roles iniciales propuestos: **Administrador** administra permisos y maestros. **Presupuestista** prepara obras, partidas y borradores de su organización. **Revisor** devuelve con observaciones o emite una versión. **Consulta** accede a las versiones autorizadas. Cada acción se valida en el servidor para la organización y la obra.

## Maestros y modelo mínimo de datos

| Entidad | Datos mínimos | Regla o relación |
| --- | --- | --- |
| Organización | Identificador, razón social, moneda por defecto, estado | Separa los registros de cada organización. |
| Usuario y rol | Usuario, organización, rol, estado | Los permisos se verifican por acción y obra. |
| Cliente | Código, razón social, identificación fiscal opcional, contacto | Una obra pertenece a un cliente. Código único por organización. |
| Proveedor | Código, razón social, contacto, identificación opcional | Vinculable al precio de referencia. Puede usar un ID del maestro de proveedores existente si está conciliado. |
| Unidad | Código, nombre, dimensión | Ejemplos m, m², m³, kg, unidad, equipo-día y persona-día. Guardar el código de la unidad y controlar las conversiones. |
| Familia | Código, nombre, tipo de insumo | Clasificación del catálogo. La asociación con índices queda para reconsideraciones. |
| Insumo | Código, tipo MATERIAL/EQUIPO/MANO_OBRA, descripción, unidad, familia y estado | Código único por tipo y organización. Una desactivación conserva el historial. |
| Precio de insumo | Insumo, fecha de vigencia, moneda, costo, base del costo, fuente, proveedor opcional | Historial con vigencias. Para equipos y mano de obra la base usada por el APU inicial es diaria. |
| Partida modelo | Código, descripción, unidad de obra, rendimiento, versión, código normativo opcional | Plantilla reutilizable. Una edición crea una revisión y preserva las copias anteriores. |
| Insumo de partida modelo | Partida modelo, insumo, cantidad, desperdicio opcional | Material por unidad de obra. Equipos y trabajadores necesarios para el rendimiento de un día. |
| Obra | Código, nombre, cliente, ubicación, referencia de contrato y estado | Agrupa uno o más presupuestos. |
| Versión de presupuesto | Obra, número de versión, moneda, fecha base, estado, factores, impuesto, totales, autor, fecha de emisión | La versión emitida queda bloqueada. La revisión parte de una copia en borrador. |
| Capítulo | Versión, código, nombre, orden | Agrupa renglones. Para empezar basta un nivel. |
| Renglón de presupuesto | Capítulo, número, código de partida, descripción, unidad, cantidad, modo, precio calculado, precio adoptado, motivo e importe | Copia de la partida usada. Puede vincular TAG de activo, etapa y red. Una partida modelo puede aparecer varias veces por ubicación o alcance. |
| Insumo de APU presupuestado | Renglón, tipo, código, descripción, unidad, cantidad, desperdicio, precio copiado, moneda y referencia de vigencia | Registra el precio efectivamente utilizado y permite reconstruir el cálculo aunque cambie el maestro. |
| Evento de auditoría | Obra, versión, actor, fecha, acción, motivo y cambios relevantes | Registrar emisión, devolución, recálculo y cambios de precio. |

Cadena principal: **Cliente → Obra → Versión de presupuesto → Capítulo → Renglón → Insumos del APU**. El renglón conserva la referencia opcional a la partida modelo y cada copia de insumo conserva la referencia a su precio de origen.

El **activo físico** y el **insumo** cumplen funciones distintas. Un TAG como CAND-09-01 identifica dónde se hará un trabajo. Los insumos identifican lo necesario para presupuestarlo, como materiales, uso de equipos y personal. La partida puede existir aunque todavía no se haya seleccionado un TAG.

## Casos de uso y criterios de aceptación

| ID | Acción | Resultado verificable |
| --- | --- | --- |
| CU01 | El administrador crea unidades, familias y un insumo. | El código del insumo es único dentro de su tipo y organización. La unidad es obligatoria. |
| CU02 | El presupuestista registra un nuevo precio con fecha y fuente. | Se conserva la vigencia anterior. Una obra con precio ya copiado mantiene su valor hasta que se confirme un recálculo. |
| CU03 | Se crea un cliente, una obra y un presupuesto en borrador. | La obra guarda su código, el presupuesto define fecha base y moneda y queda listo para cargar capítulos. |
| CU04 | Se crea una partida modelo con material, equipo y mano de obra. | El rendimiento es mayor que cero. El editor muestra el costo unitario por componente. |
| CU05 | Se agrega una partida modelo al presupuesto y se indica cantidad. | La partida se copia con sus insumos y precios aplicables. El importe se actualiza con la cantidad. |
| CU06 | Se agrega una partida sin APU o se adopta un precio en una partida con APU. | La partida manual exige precio ingresado. La partida con precio asumido conserva el APU, registra el motivo y muestra ambos precios. |
| CU07 | Se agrupan partidas en capítulos y se vincula un activo o etapa. | El capítulo suma sus partidas. El vínculo facilita localizar el trabajo en la planta sin modificar el precio. |
| CU08 | Se solicita recálculo de un borrador por materiales, equipos o mano de obra. | La vista previa muestra diferencia por partida y total. La confirmación afecta solo el alcance seleccionado. Los precios asumidos permanecen vigentes mientras no se retiren expresamente. |
| CU09 | Se envía el borrador a revisión. | El servidor valida precios, unidades, moneda y que haya partidas. El revisor puede devolverlo con motivo o emitirlo. |
| CU10 | Se emite y luego se solicita una revisión. | La versión emitida conserva sus datos y fecha. Se crea un nuevo borrador con referencia a la versión anterior. |
| CU11 | Se consulta un presupuesto por capítulos y su hoja de APU. | El reporte usa la misma versión y los mismos totales que la pantalla. Los renglones sin APU aparecen con el precio manual. |
| CU12 | Se importa un CSV de maestros. | La vista previa identifica altas, cambios y errores por fila. El usuario confirma un lote válido y puede consultar su resultado. |

Estados propuestos: **BORRADOR → EN_REVISIÓN → EMITIDO**. Una devolución lleva a BORRADOR y registra observaciones. Solamente se edita BORRADOR. La emisión se ejecuta en una transacción, con control de revisión para impedir que se emitan cambios realizados después de la revisión.

## Reglas de cálculo para el MVP

El presupuesto usa una moneda. Los costos se copian de la vigencia disponible a la fecha base. Si falta un precio, se marca el renglón para revisión y se bloquea la emisión. Un insumo con costo cero requiere una cotización o condición que lo sustente en la aplicación.

| Componente | Fórmula propuesta | Base |
| --- | --- | --- |
| Material unitario | Suma de cantidad × costo × (1 + desperdicio/100) | Cantidad por unidad terminada. |
| Equipo unitario | Suma de cantidad × costo diario ÷ rendimiento | Equipos necesarios para producir el rendimiento diario. Usar la tarifa diaria documentada. |
| Mano de obra unitaria | Suma de cantidad × salario diario × (1 + recargo FCAS/100) ÷ rendimiento | Trabajadores de la cuadrilla. En este MVP el campo es **recargo sobre el salario**. |
| Costo directo unitario | Material + equipo + mano de obra | Unidad de la partida. |
| Administración | Directo × porcentaje/100 | Directo unitario. |
| Utilidad | (Directo + administración) × porcentaje/100 | Subtotal previo. |
| Financiamiento | (Directo + administración + utilidad) × porcentaje/100 | Subtotal previo. |
| Precio unitario calculado | Directo + administración + utilidad + financiamiento | Redondear a la precisión monetaria configurada. |
| Precio adoptado | Precio calculado, asumido o manual, según modo | El valor asumido conserva motivo y precio calculado. El manual se ingresa sin APU. |
| Importe | Cantidad de obra × precio adoptado | Redondear por renglón. |
| Total | Suma de importes + impuesto | Impuesto configurable al final, aplicado a los renglones gravados. |

Las bases de indirectos, la semántica del recargo FCAS y el redondeo por renglón son decisiones del MVP. Validarlas con presupuestos de referencia antes de migrar resultados de LuloWin. Los bonos, el FCAS indirecto y los modos especiales de IVA se dejan para la calibración. No trasladar un porcentaje histórico como valor vigente. La precisión monetaria inicial es de dos decimales con redondeo a mitad hacia arriba. Mantener decimales intermedios y números decimales exactos, sin cálculos monetarios con coma flotante binaria.

### Ejemplo verificable

Para montar un soporte con rendimiento de 10 unidades/día se presupuestan 2 unidades de material de costo 40 y desperdicio del 5 %, un equipo de costo diario 120 y dos trabajadores con salario diario 60 más recargo FCAS del 50 %.

| Cálculo | Resultado |
| --- | ---: |
| Material por unidad | 84,00 |
| Equipo por unidad | 12,00 |
| Mano de obra por unidad | 18,00 |
| Directo | 114,00 |
| Administración al 10 % | 11,40 |
| Utilidad al 10 % sobre 125,40 | 12,54 |
| Precio unitario con financiamiento al 0 % | 137,94 |
| 25 unidades de la partida | 3.448,50 |
| 4 unidades de un servicio manual a 125,00 | 500,00 |
| Subtotal | 3.948,50 |
| Impuesto de demostración al 16 % | 631,76 |
| Total de demostración | 4.580,26 |

El ejemplo usa datos ficticios. Se puede reproducir con `python motor_presupuesto.py ejemplo_presupuesto.json`.

## Integración de la web

1. Implementar maestros, obras y versiones de presupuesto. Usar ID internos y códigos de negocio independientes.
2. Crear el editor de renglones y calcular con el motor del servidor. En un borrador, reemplazar insumos y factores solamente como resultado de una acción de edición o recálculo.
3. Separar vista previa y aplicación del recálculo. En la confirmación enviar la revisión del borrador y el alcance. Si alguien editó la versión mientras tanto, solicitar una nueva vista previa.
4. Generar el presupuesto por capítulos y el APU a partir de la misma versión. Incluir datos de obra, moneda, fecha base y desglose. CSV sirve para intercambio de datos y una vista de impresión para PDF.
5. Integrar el selector de activo, etapa y red con Activos Físicos. Guardar las referencias de catálogo en el renglón y mantener la navegación hacia el activo.

Operaciones que deberá exponer la aplicación: listar maestros y precios vigentes, crear obra, abrir versión, editar capítulos y renglones, obtener cálculo, previsualizar y confirmar recálculo, enviar a revisión, emitir y consultar reportes. En emisión y recálculo se valida autorización, estado y número de revisión en el servidor. El cliente muestra los totales que devuelve el servidor.

## Lectura del catálogo incluido y migración

Se abrió `LULO.mdb` en lectura y se contaron registros de estas tablas.

| Tabla original | Registros observados | Destino propuesto |
| --- | ---: | --- |
| ObraMate | 8.140 | Materiales y referencias históricas de costo. |
| ObraEqui | 1.124 | Equipos. Revisar costo base, costo diario y depreciación antes de importar. |
| ObraMano | 334 | Oficios y salarios diarios históricos. |
| ObraPart | 10.596 | Partidas modelo. Revisar unidad, rendimiento y precio legado. |
| ObraPainMate | 28.385 | Materiales de partidas modelo, cantidad y desperdicio. |
| ObraPainEqui / ObraPainMano | 36.459 / 42.684 | Recursos de equipo y mano de obra asociados a partidas modelo. |
| ObraFami | 40 | Familias de insumos. |
| ObraProy / ObraApun / ObraCapi | 0 / 0 / 0 | Obras, renglones presupuestados y capítulos. |
| ObraProv / ObraMedi / ObraValu | 0 / 0 / 0 | Proveedores, mediciones y valuaciones. |

El esquema separa la partida de catálogo (`ObraPart`, `ObraPain*`) de los renglones de una obra (`ObraApun`, `ObraApin*`). Esa separación respalda la distinción entre maestro reutilizable y copia presupuestada. `MenuRep.xml` identifica las familias de reportes APU, presupuestos, mediciones, cómputos, valuaciones e insumos.

Si se decide migrar el catálogo, comenzar con una muestra conciliada. Comparar códigos, unidades y relaciones de insumos, marcar vigencias y moneda pendientes y actualizar precios con fuentes propias antes de usar el catálogo en una cotización. Los conteos corresponden al archivo distribuido. Este paquete de especificación trae un ejemplo propio y no vuelca los catálogos del instalador.
