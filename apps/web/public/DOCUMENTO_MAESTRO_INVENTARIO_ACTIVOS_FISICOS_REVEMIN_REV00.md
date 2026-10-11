# DOCUMENTO MAESTRO — INVENTARIO DE ACTIVOS FÍSICOS Y EQUIPOS
**Planta REVEMIN — Inventario integrado, depurado y trazable | REV00 | 11/10/2026**

**Estado documental:** conciliación preliminar para levantamiento y validación en campo; no constituye certificación de existencia ni aptitud operativa.

## 1. Objeto y alcance
Consolidar los activos físicos y equipos registrados en las cuatro hojas de cálculo suministradas, sin duplicar los registros que aparecen en más de una fuente. Se conservan las unidades físicas distintas aunque compartan denominación (p. ej., motores, bombas o agitadores); cada ID representa un registro de activo y no una familia comercial de productos. La lista integra equipos de proceso, motores y auxiliares individuales cuando figuran como registros separados en la fuente.

## 2. Fuentes, jerarquía y política de depuración
| Clave | Archivo original | Uso |
|---|---|---|
| F1 | `Inventario_REVEMIN_Consolidado_Actualizado.xlsm` | Base maestra conciliada con campos eléctricos, técnicos, fuente y observaciones. |
| F2 | `Copy of Inventario de Equipos Revemin 202.xlsx` — hoja `LISTADO DE EQUIPOS` | Inventario técnico, fabricante, dimensiones y situación; la hoja `Copy of LISTADO DE EQUIPOS` replica el inventario y no se sumó por separado. |
| F3 | `Lista_Equipos_REVEMIN_Digitalizada.xlsm` | Lista eléctrica transcrita: códigos, potencias, corrientes, kVA y anotaciones de revisión. |
| F4 | `Lista_Equipos_REVEMIN_Digitalizada (1).xlsm` | Copia idéntica de F3 en los registros analizados; no se agrega al conteo. |

**Reglas:** (a) conservar como una sola fila los registros integrados por F1 entre fuentes; (b) usar `Código` eléctrico para identificar una unidad cuando existe; (c) para registros sin código, mantener ID `INV-...` y área de origen; (d) nunca colapsar equipos solo por compartir nombre; (e) no duplicar hojas de copia ni libros duplicados; (f) las coincidencias o posibles redundancias no concluyentes se señalan para revisión, sin suprimir activos físicos potencialmente distintos.

## 3. Resultado ejecutivo
- **281 registros de activos** en el consolidado de referencia: **148** con prefijo ELEC y **133** con prefijo INV.
- **281 IDs únicos**, **130 códigos eléctricos distintos** y **0 códigos eléctricos repetidos** dentro del maestro.
- Las cantidades son las indicadas en las fuentes y no deben confundirse con el número de líneas del inventario. Las celdas sin datos se señalan como «—».
- La potencia eléctrica y el total en kVA de documentos de origen requieren conciliación técnica; valores eléctricos escritos o digitalizados no son necesariamente valores de placa.

### 3.1 Distribución por secciones (sin doble conteo entre fuentes)
| Sección | Registros | ELEC | INV | Cantidad declarada* |
|---|---:|---:|---:|---:|
| Absorción / CIC | 7 | 0 | 7 | 7 |
| Cal | 7 | 4 | 3 | 7 |
| Carbón en pulpa (CIP) | 21 | 0 | 21 | 21 |
| Carbón en pulpa (CIP) y manejo de colas | 26 | 26 | 0 | 26 |
| Cianuro | 10 | 5 | 5 | 10 |
| Continuación del bloque H (sin encabezado visible) | 8 | 8 | 0 | 8 |
| Diesel | 3 | 3 | 0 | 3 |
| Elusión | 35 | 19 | 16 | 35 |
| Espesamiento | 12 | 7 | 5 | 12 |
| Floculante | 6 | 4 | 2 | 6 |
| Fundición | 4 | 0 | 4 | 4 |
| Laboratorio (manuscrito) | 13 | 13 | 0 | 14 |
| Lavado ácido | 6 | 0 | 6 | 6 |
| Lixiviación | 20 | 11 | 9 | 20 |
| Manejo de colas | 4 | 0 | 4 | 4 |
| Molienda | 32 | 11 | 21 | 32 |
| Patio de mineral | 1 | 0 | 1 | 1 |
| Prelixiviación | 6 | 3 | 3 | 6 |
| Servicios | 1 | 0 | 1 | 1 |
| Suministro de agua | 19 | 11 | 8 | 19 |
| Suministro de aire | 2 | 2 | 0 | 2 |
| Taller (manuscrito) | 3 | 3 | 0 | 3 |
| Trituración | 35 | 18 | 17 | 35 |
| **TOTAL** | **281** | **148** | **133** | **282** |

*Suma aritmética de cantidades explícitas; verificar en campo el criterio de unidad (conjunto vs. componente) antes de utilizarla como número de equipos instalados.*

## 4. Registro maestro completo de activos
Orden: sección de proceso → área → código → ID de origen. Los campos numéricos se reproducen tal como constan en el consolidado, sin redimensionamiento ni correcciones no respaldadas.

### Absorción / CIC (7 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-095 | ABSORCIÓN | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-096 | ABSORCIÓN | — | Bomba de solución rica A | 1 | — | — | — | — | FLOWSERVE / WEG | Equipo operativo; necesita repuestos consumibles como rodamientos, bocina y empaquetadura; Solo inventario técnico |
| INV-097 | ABSORCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-098 | ABSORCIÓN | — | Bomba de solución rica B | 1 | — | — | — | — | FLOWSERVE / WEG | Equipo stand-by; necesita repuestos consumibles como rodamientos, bocina y empaquetadura; Solo inventario técnico |
| INV-099 | ABSORCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo enviado a reparación en empresa externa; Solo inventario técnico |
| INV-100 | ABSORCIÓN | — | Bomba de transferencia de carbón de tanque cónico | 1 | — | — | — | — | Warman / Eq G "rep ext | Equipo operativo; Solo inventario técnico |
| INV-101 | ABSORCIÓN | — | Motor eléctrico | 1 | — | — | — | — | Eq G "rep ext | po enviado a; racion empresa: ma; Solo inventario técnico |

### Cal (7 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-079 | CAL | — | Tanque de preparación de cal 1 | 1 | — | — | — | — | — | Solo inventario técnico |
| INV-081 | CAL | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-083 | CAL | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| ELEC-104 | Planta de proceso / servicios | R-050/A | Bomba transfcal #1 | 1 | 440 | 9 | 11.66 | 12.2 | Warman | Equipo operativo; necesita repuestos consumibles como rodamientos, bocina y empaquetadura; Coincidencia alta |
| ELEC-105 | Planta de proceso / servicios | R-050/B | Bomba transf. cal #2 | 1 | 440 | 9 | 11.66 | 12.2 | Warman | Equipo operativo; necesita repuestos consumibles como rodamientos, bocina y empaquetadura; Coincidencia baja |
| ELEC-106 | Planta de proceso / servicios | R-055/1 | Agitador #1 | 1 | 440 | 6.6 | 9.1 | 9.5 | FALK / WEG | Equipo operativo; Coincidencia alta |
| ELEC-107 | Planta de proceso / servicios | R-065/1 | Agitador #2 | 1 | 440 | 6.6 | 9.1 | 9.5 | — | Sin coincidencia |

### Carbón en pulpa (CIP) (21 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-121 | CARBÓN EN PULPA | — | Cajón de distribución de tanques CIP | 1 | — | — | — | — | EN formación tabric | IVO, requiero: cion y roomblazo; Solo inventario técnico |
| INV-122 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 1 | 1 | — | — | — | — | Equip 'ropare an , ¿Ostruc ¿kambs | operativo requiere! lon parto: ral y cajon de ' da; Solo inventario técnico |
| INV-123 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 2 | 1 | — | — | — | — | Equip repara m : ¿Ostruci :kamba | operativo requiero! lon parto: ral y cajon de: la; Solo inventario técnico |
| INV-124 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 3 | 1 | — | — | — | — | Equipc :rOpara n ' tostruct :kamba | operativo requiere: on parto: ral y cajon de: la; Solo inventario técnico |
| INV-125 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 4 | 1 | — | — | — | — | Equipo 'ropara n : «Ostruct *kambal | Operativo requiore! on parte: ral y cajon de: a; Solo inventario técnico |
| INV-126 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 5 | 1 | — | — | — | — | Equipo ; ¡roparac sostruct «kambal | dporativo requiere; nm parte: al y cajon de: a; Solo inventario técnico |
| INV-127 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 7 | 1 | — | — | — | — | Releven | Equipo operativo; requiere reparación estructural y del cajón de Kambalda; Solo inventario técnico |
| INV-128 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 8 | 1 | — | — | — | — | Releven | Equipo operativo; requiere reparación estructural y del cajón de Kambalda; Solo inventario técnico |
| INV-129 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 9 | 1 | — | — | — | — | Releven | Equipo operativo; requiere reparación estructural y del cajón de Kambalda; Solo inventario técnico |
| INV-130 | CARBÓN EN PULPA | — | Tanque de carbón en pulpa N° 10 | 1 | — | — | — | — | Releven | Equipo operativo; requiere reparación estructural y del cajón de Kambalda; Solo inventario técnico |
| INV-142 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-144 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo inoperativo; Solo inventario técnico |
| INV-146 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | A E E | QuIpo operativo; Solo inventario técnico |
| INV-148 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | DOES AAAAADAAAA | QuIpo operativo; Solo inventario técnico |
| INV-150 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | voQ : ' ' ERAS | QuUIPo operativo; Solo inventario técnico |
| INV-152 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | ro.onnrsn.". . ... .n .....ssa st | quipo operativo; Solo inventario técnico |
| INV-154 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-156 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-158 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | Neg | QUIpo operativo; Solo inventario técnico |
| INV-160 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | — | QUIpPO operativo; Solo inventario técnico |
| INV-162 | CARBÓN EN PULPA | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |

### Carbón en pulpa (CIP) y manejo de colas (26 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-051 | Planta de proceso / servicios | E-110/1 | Agitador CIP 1 | 1 | 440 | 22 | 30 | 25 | Mixtec | Equipo operativo; requiere mantener stock de aspas y eje; Coincidencia alta |
| ELEC-052 | Planta de proceso / servicios | E-120/1 | Agitador CIP 2 | 1 | 440 | 22 | 30 | 25 | Equ ec mar eje | Jo operativo, requiere: er stock de aspas y; Coincidencia alta |
| ELEC-053 | Planta de proceso / servicios | E-130/1 | Agitador CIP 3 | 1 | 440 | 22 | 30 | 25 | Equil :C «mant ¿eje | operativo, requiere: r stock de aspas y; Coincidencia alta |
| ELEC-054 | Planta de proceso / servicios | E-140/1 | Agitador CIP 4 | 1 | 440 | 22 | 30 | 25 | Equip . "mante teje | operativo, requiere! stock de aspas y; Coincidencia alta |
| ELEC-055 | Planta de proceso / servicios | E-150/1 | Agitador CIP 5 | 1 | 440 | 22 | 30 | 25 | Equi 3C ¿man seje | o operativo, requiere: r stock de aspas y; Coincidencia alta |
| ELEC-056 | Planta de proceso / servicios | E-160/1 | Agitador CIP 6 | 1 | 440 | 22 | 30 | 25 | Equíf c 'mant ¡eje | operativo, requiere! r stock de aspas y; Coincidencia alta |
| ELEC-057 | Planta de proceso / servicios | E-170/1 | Agitador CIP 7 | 1 | 440 | 22 | 30 | 25 | Equip - "mante ¡eje | operativo, requiere! stock de aspas y; Coincidencia alta |
| ELEC-058 | Planta de proceso / servicios | E-180/1 | Agitador CIP 8 | 1 | 440 | 22 | 30 | 25 | Mixtec | Equipo operativo; requiere mantener stock de aspas y eje; Coincidencia alta |
| ELEC-059 | Planta de proceso / servicios | E-190/1 | Agitador CIP 9 | 1 | 440 | 22 | 30 | 25 | Mixtec | Equipo operativo; requiere mantener stock de aspas y eje; Coincidencia alta |
| ELEC-060 | Planta de proceso / servicios | E-200/1 | Agitador CIP 10 | 1 | 440 | 22 | 30 | 25 | Mixtec | Equipo operativo; requiere mantener stock de aspas y eje; Coincidencia alta |
| ELEC-061 | Planta de proceso / servicios | E-210 | Bomba de transferencia 1 | 1 | 440 | 9 | 11.54 | 10 | Bomba vertical ZPR-65QV / Ziddon Pump / WEG | Equipo operativo; mantenimiento rutinario de impulsor, revestimiento y caracol; Coincidencia alta |
| ELEC-062 | Planta de proceso / servicios | E-220 | Bomba de transferencia 2 | 1 | 440 | 9 | 11.5 | 10 | BOMBA VERTICAL ZPR-650Y. Mir N° 2018125511, ziddon pump | Equipo operativo mantenimiento rutinano impulsor. revestimiente caracol etc; Coincidencia alta |
| ELEC-063 | Planta de proceso / servicios | E-230 | Bomba de transferencia 3 | 1 | 440 | 9 | 11.5 | 10 | BOMBA VERTICAL, ZPR-650V, Mír N° 2018125511, ziddon pump / A E E | Equipo operativo mantenimiento rutinario mpulsor, revestimiento caracol etc; Coincidencia alta |
| ELEC-064 | Planta de proceso / servicios | E-240 | Bomba de transferencia 4 | 1 | 440 | 9 | 11.5 | 10 | BOMBA VERTICAL, ZPR-650V, Mir N° 2D18125511, ziddon JUMP / DOES AAAAADAAAA | QuUIpo operativo, nantenimiento — rutinano, mpulsor, revestimiento aracol etc; Coincidencia alta |
| ELEC-065 | Planta de proceso / servicios | E-250 | Bomba de transferencia 5 | 1 | 440 | 9 | 11.5 | 10 | JOMBA VERTICAL. 'PR-GSOV, Mír N% : 1018125511, ziddon: JUMP / voQ : ' ' ERAS | QUIPo operativo. hantenimiento rutinano, mpulsor, revestimiento aracol etc; Coincidencia alta |
| ELEC-066 | Planta de proceso / servicios | E-260 | Bomba de transferencia 6 | 1 | 440 | 9 | 11.5 | 10 | JOMBA VERTICAL: 'PR-65QV, Mír N° :; 'D18125511, ziddon: 'UMPp / ro.onnrsn.". . ... .n .....ssa st | QuUIpo Operativo, vantenimiento rutinario, npulsor, revestimiento aracol etc; Coincidencia alta |
| ELEC-067 | Planta de proceso / servicios | E-270 | Bomba de transferencia 7 | 1 | 440 | 9 | 11.5 | 10 | BOMBA VERTICAL ZPR-650V, Mfr N° ZD18125511, ziddor pump / WEG | Equipo operativo mantenimiento rutinario impulsor, revestimiente caracol etc; Coincidencia alta |
| ELEC-068 | Planta de proceso / servicios | E-280 | Bomba de transferencia 8 | 1 | 440 | 9 | 11.5 | 10 | BOMBA VERTICAL, ZPR-650V, Mfr N° ZD18125511, ziddon pump / WEG | Equipo operativo mantenimiento rutinano impulsor, revestimiento caracol etc; Coincidencia alta |
| ELEC-069 | Planta de proceso / servicios | E-290 | Bomba de transferencia 9 | 1 | 440 | 9 | 11.5 | 10 | BOMBA VERTICAL, ZPR-55QV, Mfr N° : Z2D18125511, ziddon pump / Neg | QUIpo operativo, nantenimiento rutinario, mpulsor, revestimiento caracol etc; Coincidencia alta |
| ELEC-070 | Planta de proceso / servicios | E-300 | Bomba de transferencia 10 | 1 | 440 | 9 | 11.5 | 10 | BOMBA VERTICAL, ZPR-65QV, Mfr N° : 2D18125511, ziddon JUMP | QUIpo operativo, nantenimiento rutinano. mpulsor, revestimiento "aracol etc; Coincidencia alta |
| ELEC-071 | Planta de proceso / servicios | E-380 | Bomba de sumidero | 1 | 440 | 11 | 20 | 16 | SVELADA SALA / WEG | QUIPo operativo. nantenimiento rutinario. mpulsor, revestimiento aracol etc; Coincidencia alta |
| ELEC-072 | Planta de proceso / servicios | E-400 | Criba de cola | 1 | 440 | 4.5 | 20 | 16 | SISETEC C.A | Equipo operativo; Coincidencia alta |
| ELEC-073 | Planta de proceso / servicios | E-420 | Sumidero de cola | 1 | 440 | 5.5 | 10 | 8.3 | — | Equipo operativo; Coincidencia media |
| ELEC-074 | Planta de proceso / servicios | E-430 | Bomba de cola 1 | 1 | 440 | 74.5 | 115 | 95.5 | Warman | Equipo operativo; necesita repuestos consumibles como rodamientos, bocina y empaquetadura; Coincidencia alta |
| ELEC-075 | Planta de proceso / servicios | E-440 | Bomba de cola 2 | 1 | 440 | 74.5 | 115 | 95.5 | Warman | Equipo operativo; necesita repuestos consumibles como rodamientos, bocina y empaquetadura; Coincidencia alta |
| ELEC-076 | Planta de proceso / servicios | E-470 | Tubería de cola | 1 | — | — | — | — | — | Sin coincidencia |

### Cianuro (10 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-084 | CIANURO | — | Tanque de preparación de cianuro N° 1 | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-085 | CIANURO | — | Tanque de transferencia | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-089 | CIANURO | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-091 | CIANURO | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-092 | CIANURO | — | Bomba de transferencia de tanque a tanque | 1 | — | — | — | — | — | Equipo inoperativo; Solo inventario técnico |
| ELEC-110 | Planta de proceso / servicios | R-200/A | Agitador 1 | 1 | 440 | 1.9 | 4.2 | 4 | Mixtec | Equipo operativo; Coincidencia alta |
| ELEC-111 | Planta de proceso / servicios | R-200/B | Agitador 2 | 1 | — | — | — | — | — | Sin coincidencia |
| ELEC-108 | Planta de proceso / servicios | R-220 | Bomba de transferencia #1 | 1 | 220 | 2.4 | 12 | 10 | Leo | Equipo operativo; Coincidencia alta |
| ELEC-109 | Planta de proceso / servicios | R-240 | Bomba de transferencia #2 | 1 | 440 | 2.4 | 3.9 | 3.3 | FLOWSERVE | Equipo operativo; Coincidencia alta |
| ELEC-112 | Planta de proceso / servicios | R-260 | Bomba de sumidero de cianuro | 1 | 440 | 7.5 | 9.5 | 8.3 | Warman / WEG | Equipo operativo; Coincidencia alta |

### Continuación del bloque H (sin encabezado visible) (8 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-096 | Planta de proceso / servicios | H-150 | Horno de calcinación | 1 | — | — | — | — | — | Equipo Disponible; Coincidencia media |
| ELEC-097 | Planta de proceso / servicios | H-160 | Horno de fundición eléctrico | 1 | — | — | — | — | — | Equipo Disponible; Coincidencia alta |
| ELEC-098 | Planta de proceso / servicios | H-170 | Horno de fundición a gasoil | 1 | — | — | — | — | — | Equipo Disponible; Coincidencia baja |
| ELEC-099 | Planta de proceso / servicios | H-180 | Retorta de fundición | 1 | — | — | — | — | — | Sin coincidencia |
| ELEC-100 | Planta de proceso / servicios | H-300 | Celda electrolítica | 1 | 440 | 7 | 9 | 7.5 | — | Equipo Disponible; Coincidencia alta |
| ELEC-101 | Planta de proceso / servicios | H-300-1 | Celda electrolítica | 1 | 440 | 7 | 9 | 7.5 | — | Equipo Disponible; Coincidencia baja |
| ELEC-102 | Planta de proceso / servicios | H-310 | Rectificador 1 | 1 | 440 | 7 | 9 | 7.5 | — | Equipo Disponible; Coincidencia alta |
| ELEC-103 | Planta de proceso / servicios | H-315 | Rectificador 2 | 1 | 440 | 7 | 9 | 7.5 | — | Equipo Disponible; Coincidencia baja |

### Diesel (3 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-130 | Planta de proceso / servicios | S-400 | Cargador frontal | 1 | — | — | — | — | — | Sin coincidencia |
| ELEC-131 | Planta de proceso / servicios | S-440 | Grúa | 1 | — | — | — | — | — | Sin coincidencia |
| ELEC-132 | Planta de proceso / servicios | S-450 | Planta de emergencia | 1 | — | — | — | — | Doosan | Equipo fuera de servicio por correa de bomba de agua y alternador; Coincidencia media |

### Elusión (35 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-174 | ELUCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-177 | ELUCIÓN | — | Intercambiador de calor N° 3 | 1 | — | — | — | — | Alfa Laval | Equipo Operativo, requiere mantener stock de placas; Solo inventario técnico |
| INV-181 | ELUCIÓN | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-183 | ELUCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo inoperativo; Solo inventario técnico |
| INV-186 | ELUCIÓN | — | Caldera N° 2 | 1 | — | — | — | — | CHINA | Equipo inoperativo por desgaste de tuberías de agua interna; Solo inventario técnico |
| INV-189 | ELUCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-191 | ELUCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo stand-by; esperando montaje de bomba; Solo inventario técnico |
| INV-192 | ELUCIÓN | — | Tanque de agua tratada de la caldera | 1 | — | — | — | — | — | Equipo disponible; Solo inventario técnico |
| INV-193 | ELUCIÓN | — | Bomba de agua caldera N° 3 | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-194 | ELUCIÓN | — | Bomba de piso de carbón regenerado | 1 | — | — | — | — | Vulco / Metso Galingher / WEG | Equipo operativo; Solo inventario técnico |
| INV-195 | ELUCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-196 | ELUCIÓN | — | Tanque de soda cáustica N° 1 | 1 | — | — | — | — | Releven | Equipo operativo; Solo inventario técnico |
| INV-197 | ELUCIÓN | — | Tanque de soda cáustica N° 2 | 1 | — | — | — | — | Releven | Equipo operativo; Solo inventario técnico |
| INV-198 | ELUCIÓN | — | Agitador de soda cáustica N° 1 | 1 | — | — | — | — | Mixtec | Equipo operativo; Solo inventario técnico |
| INV-200 | ELUCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-202 | ELUCIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| ELEC-077 | Planta de proceso / servicios | G-100/A | Criba de carbón cargado | 1 | 440 | 12 | 19.1 | 16 | SISETEC CA | Equipo Operativo, cribs con alto gradeo de corrosión; Coincidencia alta |
| ELEC-078 | Planta de proceso / servicios | G-100/B | Criba de carbón eluido | 1 | 440 | 12 | 19.1 | 16 | Sizetec, Inc | quipo Operativo; Coincidencia alta |
| ELEC-079 | Planta de proceso / servicios | G-135 | Intercambiador I | 1 | — | — | — | — | Alfa Laval | Equipo Operativo, requiere mantener stock de placas; Coincidencia alta |
| ELEC-081 | Planta de proceso / servicios | G-150 | Columna de elución | 1 | 440 | 12 | 19.1 | 16 | SVEE | Equipo Operativo; Coincidencia alta |
| ELEC-082 | Planta de proceso / servicios | G-160 | Horno de regeneración | 1 | 440 | 25 | 29.3 | 25 | Boheler steel LTD | AnS EA o E, raras adaptaciones en contactores; Coincidencia alta |
| ELEC-083 | Planta de proceso / servicios | G-165 | Bomba de transferencia de carbón regenerado | 1 | 440 | 9 | 11.5 | 12.2 | Warman | Equipo operativo; necesita repuestos consumibles como rodamientos, bocina y empaquetadura; Coincidencia alta |
| ELEC-080 | Planta de proceso / servicios | G-180 | Criba de lavado de carbón regenerado | 1 | 440 | 12 | 19.1 | 16 | Sizetec, Inc | quipo Operativo; Coincidencia baja |
| ELEC-084 | Planta de proceso / servicios | G-195 | Bomba de sumidero de elución | 1 | 440 | 9 | 16.5 | 12.2 | BOMBA VERTICAL, ZPR-65QV, Mfr N° ZD18125511, ziddon pump ] / WEG | Equipo operativo. mantenimiento rutinario, impulsor, revestimiento caracol etc; Coincidencia media |
| ELEC-085 | Planta de proceso / servicios | G-210 | Caldera | 1 | 220 | 2 | 8.1 | 5.3 | Continental | Equipo operativo; Coincidencia alta |
| ELEC-086 | Planta de proceso / servicios | G-210/1 | Caldera | 1 | 220 | 9 | 20 | 7.7 | FULTON | Equipo inoperativo; falta culminar chimenea e instalación; Coincidencia alta |
| ELEC-088 | Planta de proceso / servicios | G-220 | Bomba de ácido clorhídrico | 1 | 440 | 30 | 40 | 33.2 | FLOWSERVE / WEG | Equipo operativo; Coincidencia alta |
| ELEC-087 | Planta de proceso / servicios | G-225 | Bomba de sumidero de carbón regenerado | 1 | 440 | 7.5 | 11.5 | 12.2 | WEG | Equipo stand-by por falta de motor eléctrico; Coincidencia alta |
| ELEC-089 | Planta de proceso / servicios | G-275 | Intercambiador II | 1 | 440 | 50 | 59.6 | 50 | Alfa Laval | Equipo Operativo, requiere mantener stock de placas; Coincidencia alta |
| ELEC-090 | Planta de proceso / servicios | G-300 | Columna CIC | 1 | — | — | — | — | — | Equipo operativo; requiere reparación estructural; Coincidencia alta |
| ELEC-091 | Planta de proceso / servicios | G-310 | Bomba de transferencia de carbón | 1 | — | — | — | — | Warman | Equipo operativo; Coincidencia alta |
| ELEC-092 | Planta de proceso / servicios | H-120/1 | Bomba eluente 1 | 1 | 440 | 10 | 12.7 | 11 | FLOWSERVE / WEG | Equipo operativo; Coincidencia media |
| ELEC-093 | Planta de proceso / servicios | H-120/2 | Bomba eluente 2 | 1 | 440 | 10 | 12.7 | 11 | FLOWSERVE / WEG | Equipo operativo; Coincidencia media |
| ELEC-094 | Planta de proceso / servicios | H-190 | Bomba de sumidero de electrólisis | 1 | 440 | 3.6 | 5 | 4.2 | — | Sin coincidencia |
| ELEC-095 | Planta de proceso / servicios | H-220 | Extractor de aire de fundición | 1 | 440 | 7 | 9 | 7.5 | — | Equipo Disponible; Coincidencia alta |

### Espesamiento (12 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-068 | ESPESADOR | — | Sistema hidráulico de espesador | 1 | — | — | — | — | Stafía | 2 de 4 Equipos operativos se cuenta con 2 motores hidráulicos nada mas, nc se cuenta con bomba hidraulica stand by; Solo inventario técnico |
| INV-071 | ESPESADOR | — | Motor eléctrico | 1 | — | — | — | — | — | Solo inventario técnico |
| INV-072 | ESPESADOR | — | Tanque de rebose del espesador | 1 | — | — | — | — | Delkor Technik | Solo inventario técnico |
| INV-073 | ESPESADOR | — | Agitador | 1 | — | — | — | — | RADICON | Solo inventario técnico |
| INV-074 | ESPESADOR | — | Tanque de bajo flujo | 1 | — | — | — | — | — | Solo inventario técnico |
| ELEC-033 | Planta de proceso / servicios | D-100 | Malla lineal | 1 | 440 | 3 | 5.9 | 5 | Delkor technik | Equipo Operativo, presenta gran deterioro en parte estructural, debe ser reemplazada por malla lineal equipo original; Coincidencia media |
| ELEC-034 | Planta de proceso / servicios | D-105 | Criba de rechazo | 1 | 440 | 1 | 1.3 | 1.1 | Delkor technik | Equipo Operativo, presenta gran deterioro en parte estructural, debe ser reemplazada por malla lineal equipo original; Coincidencia media |
| ELEC-035 | Planta de proceso / servicios | D-110 | Espesador | 1 | 440 | 24 | 17.9 | 15 | Delkor Technik | Equipo Operativo; Coincidencia alta |
| ELEC-036 | Planta de proceso / servicios | D-115 | Bomba de transferencia 1 | 1 | 440 | 40 | 46 | 38.2 | Warman | Equipo operativo necesita, repuestos consumibles como rodamientos, bocina y empaquetadura; Coincidencia alta |
| ELEC-037 | Planta de proceso / servicios | D-120 | Bomba de transferencia 2 | 1 | 440 | 40 | 46 | 38.2 | Warman | Equipo operativo necesita, repuestos consumibles como rodamientos, bocina y empaquetadura; Coincidencia baja |
| ELEC-038 | Planta de proceso / servicios | D-130 | Bomba de sumidero | 1 | 440 | 24 | 17.9 | 15 | Bomba vertical ZPR-65QV / Ziddon Pump | Equipo operativo; mantenimiento rutinario; Coincidencia alta |
| ELEC-039 | Planta de proceso / servicios | D-175 | Clarificador | 1 | 220 | 5.5 | 21 | 8 | — | Sin coincidencia |

### Floculante (6 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-113 | Planta de proceso / servicios | D-195/1 | Agitador 1 | 1 | 440 | 3.7 | 7 | 6 | RADICON | Coincidencia alta |
| ELEC-115 | Planta de proceso / servicios | D-200 | Bomba floculante #1 | 1 | 440 | 1.9 | 4.5 | 4.2 | Netzsch | Coincidencia alta |
| ELEC-114 | Planta de proceso / servicios | D-205/1 | Agitador 2 | 1 | 440 | 3.7 | 7 | 6 | RADICON | Coincidencia baja |
| ELEC-116 | Planta de proceso / servicios | D-210 | Bomba floculante #2 | 1 | 440 | 1.9 | 4.5 | 4.2 | Netzsch | Coincidencia baja |
| INV-075 | POLÍMERO | — | Tanque de preparación de polímero 1 | 1 | — | — | — | — | — | Solo inventario técnico |
| INV-076 | POLÍMERO | — | Tanque de preparación de polímero 2 | 1 | — | — | — | — | — | Solo inventario técnico |

### Fundición (4 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-231 | FUNDICIÓN | — | Quemador | 1 | — | — | — | — | — | Equipo Disponible; Solo inventario técnico |
| INV-232 | FUNDICIÓN | — | Molino de escoria | 1 | — | — | — | — | — | Equipo Disponible; Solo inventario técnico |
| INV-233 | FUNDICIÓN | — | Balanza electrónica | 1 | — | — | — | — | — | Equipo Disponible; Solo inventario técnico |
| INV-237 | FUNDICIÓN | — | Extractor de gases de electrólisis | 1 | — | — | — | — | — | Equipo Disponible; Solo inventario técnico |

### Laboratorio (manuscrito) (13 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-133 | Planta de proceso / servicios | — | Mufla 1 | 1 | 440 | — | 15 | 12.5 | — | Sin coincidencia |
| ELEC-134 | Planta de proceso / servicios | — | Mufla 2 | 1 | 440 | — | 15 | 12.5 | — | Sin coincidencia |
| ELEC-135 | Planta de proceso / servicios | — | Horno 1 | 1 | 440 | — | 30 | 25 | — | Sin coincidencia |
| ELEC-136 | Planta de proceso / servicios | — | Horno 2 | 1 | 440 | — | 30 | 25 | — | Sin coincidencia |
| ELEC-137 | Planta de proceso / servicios | — | Absorción atómica | 1 | 220 | — | 16 | 6.1 | — | Sin coincidencia |
| ELEC-138 | Planta de proceso / servicios | — | Pulverizadora | 2 | 440 | — | 18 | 16.6 | — | Sin coincidencia |
| ELEC-139 | Planta de proceso / servicios | — | Trituradora | 1 | 440 | — | 20 | 16.6 | — | Sin coincidencia |
| ELEC-140 | Planta de proceso / servicios | — | Muflas pequeñas | 1 | 220 | — | 15 | 5.7 | — | Sin coincidencia |
| ELEC-141 | Planta de proceso / servicios | — | Pulverizadora de arena | 1 | 440 | — | 18 | 16.6 | — | Sin coincidencia |
| ELEC-142 | Planta de proceso / servicios | — | Compresor | 1 | 440 | 74.5 | 80 | 66.5 | — | Sin coincidencia |
| ELEC-143 | Planta de proceso / servicios | — | Plancha #1 | 1 | 220 | — | 18 | 7.6 | — | Sin coincidencia |
| ELEC-144 | Planta de proceso / servicios | — | Plancha #2 | 1 | 220 | — | 18 | 7.6 | — | Sin coincidencia |
| ELEC-145 | Planta de proceso / servicios | — | Extractor de lavado de ácido de laboratorio | 1 | 440 | 55 | 10 | — | — | Sin coincidencia |

### Lavado ácido (6 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-205 | LAVADO DE ÁCIDO | — | Columna de lavado de ácido | 1 | — | — | — | — | FRP | Equipo operativo; Solo inventario técnico |
| INV-206 | LAVADO DE ÁCIDO | — | Tanque de carbón cargado | 1 | — | — | — | — | Releven | Fuera de servicio; Solo inventario técnico |
| INV-207 | LAVADO DE ÁCIDO | — | Bomba de transferencia de carbón | 1 | — | — | — | — | Warman | Equipo operativo; Solo inventario técnico |
| INV-208 | LAVADO DE ÁCIDO | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-210 | LAVADO DE ÁCIDO | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-211 | LAVADO DE ÁCIDO | — | Tanque de ácido | 1 | — | — | — | — | Releven | Equipo operativo; Solo inventario técnico |

### Lixiviación (20 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-109 | CARBÓN EN LIXIVIACIÓN | — | Bomba de transferencia de carbón CIL - 2 | 1 | — | — | — | — | VELADA SALA / e9 | Quipo operativo nantenimiento rutinano npulsor, revestimiento aracol etc; Solo inventario técnico |
| INV-110 | CARBÓN EN LIXIVIACIÓN | — | Motor eléctrico | 1 | — | — | — | — | e9 | QuIPo operativo; Solo inventario técnico |
| INV-111 | CARBÓN EN LIXIVIACIÓN | — | Bomba de transferencia de carbón CIL - 3 | 1 | — | — | — | — | BOMBA VERTICAL ZPR-85QV, Mfr N° ZD18125511, ziddos pump / WEG | Equipo operativi mantenimiento rutinaric Impulsor, revestimient caracol etc; Solo inventario técnico |
| INV-112 | CARBÓN EN LIXIVIACIÓN | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-113 | CARBÓN EN LIXIVIACIÓN | — | Bomba de transferencia de carbón CIL - 4 | 1 | — | — | — | — | BOMBA VERTICAL, ZPR-65QV, Mír N° : 2D18125511, ziddon JUMP / vO0g | Equipo operativo, mantenimiento rutinario, mpulsor, revestimiento caracol etc; Solo inventario técnico |
| INV-114 | CARBÓN EN LIXIVIACIÓN | — | Motor eléctrico | 1 | — | — | — | — | vO0g | quipo operativo; Solo inventario técnico |
| INV-116 | CARBÓN EN LIXIVIACIÓN | — | Motor eléctrico | 1 | — | — | — | — | in información , L | QuIÍpo operativo; Solo inventario técnico |
| INV-118 | CARBÓN EN LIXIVIACIÓN | — | Motor eléctrico | 1 | — | — | — | — | in información : 1] | quipo operativo; Solo inventario técnico |
| INV-120 | CARBÓN EN LIXIVIACIÓN | — | Motor eléctrico | 1 | — | — | — | — | — | A dde a dect ti rr Operativo; Solo inventario técnico |
| ELEC-040 | Planta de proceso / servicios | E-310 | Tanque LIX 1 / transferencia | 1 | 440 | 5.5 | 10 | 8.3 | Equ ven '1ep: ¿estr | JO Operativo, requiere* acion parte: ctural; Coincidencia alta |
| ELEC-041 | Planta de proceso / servicios | E-310/1 | Agitador LIX 1 | 1 | 440 | 30 | 57 | 47.3 | — | Sin coincidencia |
| ELEC-042 | Planta de proceso / servicios | E-320 | Tanque LIX 2 / transferencia | 1 | 440 | 5.5 | 10 | 8.3 | Equi ven ¡repa estr | o operativo, requiere: cion parte; tural; Coincidencia alta |
| ELEC-043 | Planta de proceso / servicios | E-320/1 | Agitador LIX 2 | 1 | 440 | 30 | 57 | 47.3 | Mixtec | Equipo operativo, Ss cambiaron eje y aspas e junio 2024; Coincidencia alta |
| ELEC-044 | Planta de proceso / servicios | E-330 | Tanque LIX 3 / transferencia | 1 | 440 | 5.5 | 10 | 8.3 | Equi ven :repal ¿estru | o operativo, requiere: ¡cion parte: tural; Coincidencia alta |
| ELEC-045 | Planta de proceso / servicios | E-330/1 | Agitador LIX 3 | 1 | 440 | 30 | 57 | 47.3 | Mixtec | Equipo operativo, se cambiaron eje y aspas en unio 2024; Coincidencia alta |
| ELEC-048 | Planta de proceso / servicios | E-340 | Bomba transf. A | 1 | 440 | 25 | 30 | 25 | Narman / in información , L | QuIpo operativo necesita opuestos consumibles 'omo rodamientos, bocina ''empaquetadura; Coincidencia media |
| ELEC-049 | Planta de proceso / servicios | E-350 | Bomba transf. B | 1 | 440 | 25 | 30 | 25 | Ñ L Varman / in información : 1] | QquIpo operativo necesita ppuestos consumibles omo rodamientos, bocina 'empaquetadura; Coincidencia media |
| ELEC-050 | Planta de proceso / servicios | E-360 | Bomba de sumidero | 1 | 440 | 11 | 14.1 | 12.5 | BA VERTICAL, ¿Equi 05QV, Mír N° ::mant 1125511, ziddonsimpu ] ¡carac | ea Y 4 ; y operativo, nimiento rutinario, ! * or, — revestimiento: lote ' y; Coincidencia alta |
| ELEC-046 | Planta de proceso / servicios | E-370 | Tanque LIX 4 / transferencia | 1 | 440 | 5.5 | 10 | 8.3 | Equi ¡en :repal :estru | operativo, requiere' cion parte: lural; Coincidencia alta |
| ELEC-047 | Planta de proceso / servicios | E-370/1 | Agitador LIX 4 | 1 | 440 | 30 | 57 | 47.3 | Mixtec | Quipo operativo, se -ambiaron eje y aspas en ulio 2024; Coincidencia alta |

### Manejo de colas (4 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-166 | COLA | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-168 | COLA | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-169 | COLA | — | Bomba de piscina | 1 | — | — | — | — | Svedala Sala / WEG | Equipo operativo; mantenimiento rutinario de impulsor, revestimiento y caracol; Solo inventario técnico |
| INV-170 | COLA | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |

### Molienda (32 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-019 | Área A - Preparación del material (recepción y trituración) | C-145/1 | Molino de bolas secundario M1 | 1 | 440 | 400 | 451 | 343.3 | Osborn MMD | Equipo inoperativo po caja reductora en procest de reparacion; Coincidencia alta |
| ELEC-020 | Área A - Preparación del material (recepción y trituración) | C-145/2 | Movimiento lento M1 | 1 | 440 | 6.6 | 9.6 | 8.3 | Osborn MMD | Equipo inoperativo po caja reductora en procest de reparacion; Coincidencia media |
| ELEC-021 | Área A - Preparación del material (recepción y trituración) | C-155/A | Bomba de hidrociclón N.º 1 | 1 | 440 | 90 | 150 | 124.6 | Warnan / Industrial Electric | Equipo operativo necesita repuestos consumibles como rodamientos. bocina y empaquetadura; Coincidencia alta |
| ELEC-022 | Área A - Preparación del material (recepción y trituración) | C-155/B | Bomba de hidrociclón N.º 2 | 1 | 440 | 90 | 150 | 124.6 | Warnan / Industrial Electric | Equipo operativo necesita. repuestos consumibles como rodamientos, bocina y empaquetadura; Coincidencia alta |
| ELEC-023 | Área A - Preparación del material (recepción y trituración) | C-200/1 | Molino de bolas secundario M2 | 1 | 440 | 400 | 451 | 343.3 | Turbo acople, marc luctora, Marca BEW 962:1, Motor de gir 50 VAC, 1128 RPM o electromagnétic to: BEW 8/4 relació ñón helicoidal de 2 te M2204-01A, 239/600 CAK/W33 / 1190 RPM, 60 H | Osborn MMD $ É h; Coincidencia alta |
| ELEC-024 | Área A - Preparación del material (recepción y trituración) | C-200/2 | Movimiento lento M2 | 1 | 440 | 6.6 | 9.6 | 8.3 | Turbo acople, marc luctora, Marca BEW 962:1, Motor de gir 50 VAC, 1128 RPM o electromagnétic to: BEW 8/4 relació ñón helicoidal de 2 te M2204-01A, 239/600 CAK/W33 / 1190 RPM, 60 H | Osborn MMD $ É h; Coincidencia media |
| ELEC-025 | Área A - Preparación del material (recepción y trituración) | C-290 | Bomba de sumidero M1/M2 | 1 | 440 | 9 | 11.66 | 10.8 | BOMBA VERTICAL, ZPRESOV, Mír N° 2018125511, ziddon pump | Equipo operativo mantenimiento rutinano, mpulsor, revestimetno raracol etc; Coincidencia baja |
| ELEC-026 | Área A - Preparación del material (recepción y trituración) | C-300 | Cinta transportadora N.º 9 | 1 | 440 | 12 | 16 | 12.2 | — | Sin coincidencia |
| ELEC-027 | Área A - Preparación del material (recepción y trituración) | C-320 | Cinta transportadora N.º 10 | 1 | 440 | 15 | 19.1 | 16.6 | metros de longituc llos de impacto, 2 no, 1 rodillo de cols y | Cinta Goodyear; Coincidencia alta |
| ELEC-028 | Área A - Preparación del material (recepción y trituración) | C-340 | Molino de bolas primario | 1 | 4000 | 746 | 114 | 95 | 2ntación 75.000 Kc tevestimiento intern 'ague, marca eator parte 507749, clut 2 parte 507748, rotc l* de parte 50463 / motor synchronou: RPM 257, amp 11: t. Amp 66, tipo an | Metso; Coincidencia alta |
| ELEC-029 | Área A - Preparación del material (recepción y trituración) | C-350 | Bomba de sumidero M3 | 1 | 440 | 9 | 16.5 | 14.1 | BOMBA VERTICAL, ZPRESOV, Mír N° 2018125511, ziddon pump | Equipo operativo mantenimiento rutinano, mpulsor, revestimetno raracol etc; Coincidencia baja |
| INV-032 | MOLIENDA | — | Silo N° 1 | 1 | — | — | — | — | Releven | Operativo; Solo inventario técnico |
| INV-033 | MOLIENDA | — | Silo N° 2 | 1 | — | — | — | — | — | Releven; Solo inventario técnico |
| INV-035 | MOLIENDA | — | Motor reductor | 1 | — | — | — | — | — | PEA A ¡Sew; Solo inventario técnico |
| INV-036 | MOLIENDA | — | Cinta transportadora N° 8 | 1 | — | — | — | — | llos de impacto, 1. orno, 11 estacione idillo motriz | Cinta Goodyear; Solo inventario técnico |
| INV-037 | MOLIENDA | — | Motor reductor | 1 | — | — | — | — | Hp, frame 210TY 3,9; clase de servici | Dodge; Solo inventario técnico |
| INV-039 | MOLIENDA | — | Motor eléctrico | 1 | — | — | — | — | motor synchronou: RPM 257, amp 11: t. Amp 66, tipo an | Westinghouse; Solo inventario técnico |
| INV-041 | MOLIENDA | — | Motor eléctrico | 1 | — | — | — | — | 1190 RPM, 60 H | Solo inventario técnico |
| INV-043 | MOLIENDA | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo stand by; Solo inventario técnico |
| INV-045 | MOLIENDA | — | Motor eléctrico | 1 | — | — | — | — | Industrial Electric | Equipo Operativo; Solo inventario técnico |
| INV-046 | MOLIENDA | — | Hidrociclón A | 1 | — | — | — | — | FLSMITH | Equipo operativo necesita realizar mantenimiento reemplazo de apex y; Solo inventario técnico |
| INV-048 | MOLIENDA | — | Motor eléctrico | 1 | — | — | — | — | Industrial Electric | Equipo Operativo; Solo inventario técnico |
| INV-049 | MOLIENDA | — | Hidrociclón B | 1 | — | — | — | — | FLSMITH | Equipo operativo necesita realizar mantenimiente reemplazo de apex y; Solo inventario técnico |
| INV-051 | MOLIENDA | — | Motor eléctrico | 1 | — | — | — | — | — | quipo operativo; Solo inventario técnico |
| INV-052 | MOLIENDA | — | Bomba de lubricación conjunto piñón-corona | 1 | — | — | — | — | Lincoln | Equipo operativo; Solo inventario técnico |
| INV-053 | MOLIENDA | — | Bomba de lubricación de alta presión Molino N° 3 | 1 | — | — | — | — | — | Equipo operativo, no se cuenta con otra bomba stand by; Solo inventario técnico |
| INV-054 | MOLIENDA | — | Bomba de lubricación de baja presión Molino N° 3 | 1 | — | — | — | — | — | Equipo operativo, nop se cuenta con otra bomba stand by; Solo inventario técnico |
| INV-055 | MOLIENDA | — | Bomba de lubricación conjunto piñón-corona | 1 | — | — | — | — | Lincoln | Equipo operativo; Solo inventario técnico |
| INV-056 | MOLIENDA | — | Bomba de lubricación de cojinetes Molinos 1 y 2 | 1 | — | — | — | — | Lincoln | Equipo operativo; Solo inventario técnico |
| INV-057 | MOLIENDA | — | Cajón de bajo flujo de hidrociclones | 1 | — | — | — | — | — | Equipo Operativo, requiere fabricacion y reemplazo; Solo inventario técnico |
| INV-058 | MOLIENDA | — | Sumidero de molienda | 1 | — | — | — | — | — | Equipo Operativo, requiere fabricacion y reemplazo; Solo inventario técnico |
| INV-059 | MOLIENDA | — | Balanza de cinta N° 10 | 1 | — | — | — | — | Ramsey | Equipo operativo, calibracion cada 6 meses; Solo inventario técnico |

### Patio de mineral (1 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-001 | PATIO DE MINERAL | — | Balanza de camiones | 1 | — | — | — | — | Colonico | Equipo operativo calibracion cada 6 meses; Solo inventario técnico |

### Prelixiviación (6 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-030 | Planta de proceso / servicios | C-370/1 | Agitador prelix | 1 | 440 | 22 | 30 | 25 | SEW | Equipo operativo, manter stock de aspas superiores e inferiores; Coincidencia alta |
| ELEC-031 | Planta de proceso / servicios | C-380/1 | Agitador prelix | 1 | 440 | 22 | 30 | 25 | SEW | Equipo operativo. mante «stock de aspas superiore ;8 inferiores; Coincidencia alta |
| ELEC-032 | Planta de proceso / servicios | C-390 | Bomba de transferencia de pre-lix | 1 | 440 | 44.5 | 93 | 77.3 | Warman | Equipo operativo necesita repuestos consumible: ¿Como rodamientos, bocin: : y empaquetadura; Coincidencia alta |
| INV-060 | PRE LIX | — | Tanque pre-lix 1 | 1 | — | — | — | — | Releven | Equipo operativo; Solo inventario técnico |
| INV-062 | PRE LIX | — | Tanque pre-lix 2 | 1 | — | — | — | — | Releven | Equipo operativo tanque en buenas condiciones; Solo inventario técnico |
| INV-065 | PRE LIX | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |

### Servicios (1 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| INV-204 | SERVICIOS | — | Planta eléctrica de emergencia TRUE POWER | 1 | — | — | — | — | TRUE POWER | Equipo operativo; Solo inventario técnico |

### Suministro de agua (19 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-117 | Planta de proceso / servicios | S-100 | Bomba de agua a caldera y floculante 1 | 1 | — | — | — | — | WEG | Equipo operativo; Coincidencia media |
| ELEC-118 | Planta de proceso / servicios | S-110 | Bomba de agua a caldera y floculante 2 | 1 | — | — | — | — | WEG | Equipo inoperativo; desmontado por caldera dañada; Coincidencia media |
| ELEC-119 | Planta de proceso / servicios | S-120 | Tanque de agua del circuito de molinos | 1 | — | — | — | — | — | Equipo operativo; Coincidencia alta |
| ELEC-120 | Planta de proceso / servicios | S-130 | Tanque de agua para caldera | 1 | — | — | — | — | — | Equipo operativo; Coincidencia alta |
| ELEC-121 | Planta de proceso / servicios | S-140 | Bomba de agua del circuito de molinos 1 | 1 | 440 | 74.5 | 115 | 96 | Warman | Equipo operativo; mantener stock de consumibles, rodamientos y válvulas de succión y descarga; Coincidencia media |
| ELEC-122 | Planta de proceso / servicios | S-150 | Bomba de agua del circuito de molinos 2 | 1 | 440 | 74.5 | 115 | 96 | Warman | Equipo operativo; mantener stock de consumibles, rodamientos y válvulas de succión y descarga; Coincidencia media |
| ELEC-123 | Planta de proceso / servicios | S-170 | Tanque de agua de servicio (alta presión) | 1 | — | — | — | — | — | Equipo operativo; Coincidencia media |
| ELEC-124 | Planta de proceso / servicios | S-220 | Bomba de agua de alta presión 1 | 1 | 440 | 45 | 100 | 83 | KSB | Equipo operativo; Coincidencia alta |
| ELEC-125 | Planta de proceso / servicios | S-225 | Bomba de agua de alta presión 2 | 1 | 440 | 45 | 100 | 83 | KSB | Equipo operativo; Coincidencia alta |
| ELEC-126 | Planta de proceso / servicios | S-230 | Bomba para agua de sellos 1 | 1 | — | — | — | 31.2 | — | Sin coincidencia |
| ELEC-127 | Planta de proceso / servicios | — | Bomba de pozo profundo | 1 | 220 | 3 | 14 | — | Franklin electric | Equipo inoperativo; Coincidencia alta |
| INV-214 | SERVICIOS DE AGUA | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-216 | SERVICIOS DE AGUA | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-219 | SERVICIOS DE AGUA | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo disponible; Solo inventario técnico |
| INV-221 | SERVICIOS DE AGUA | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo disponible; Solo inventario técnico |
| INV-222 | SERVICIOS DE AGUA | — | Balsa | 1 | — | — | — | — | — | Equipo disponible; Solo inventario técnico |
| INV-223 | SERVICIOS DE AGUA | — | Bomba de balsa | 1 | — | — | — | — | BOMBA VERTICAL, ZPR-G5QV, Mír N° 2018125511, ziddon pump | Equipo operativo, mantenimiento rutinario, impulsor, revestimiento caracol eto; Solo inventario técnico |
| INV-224 | SERVICIOS DE AGUA | — | Motor de la balsa | 1 | — | — | — | — | WEG | Equipo operativo; Solo inventario técnico |
| INV-225 | SERVICIOS DE AGUA | — | Tanque de suministro de agua a oficinas | 1 | — | — | — | — | — | Equipo Disponible; Solo inventario técnico |

### Suministro de aire (2 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-128 | Planta de proceso / servicios | S-300 | Compresor 1 | 1 | 440 | 260 | 245 | 220 | Atlas Copco | Equipo Disponible; Coincidencia alta |
| ELEC-129 | Planta de proceso / servicios | S-310 | Compresor 2 | 1 | 440 | 186 | 180 | 150 | Atlas Copco | Equipo Disponible; Coincidencia alta |

### Taller (manuscrito) (3 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-146 | Planta de proceso / servicios | — | Torno | 1 | 440 | — | 16 | 13.3 | — | Sin coincidencia |
| ELEC-147 | Planta de proceso / servicios | — | Fresa | 1 | 440 | — | 20 | 16 | — | Sin coincidencia |
| ELEC-148 | Planta de proceso / servicios | — | Taladro | 1 | 440 | — | 20 | 16 | — | Sin coincidencia |

### Trituración (35 registros)
| ID | Área | Código | Equipo / activo | Cant. | V | kW | A | kVA fuente | Fabricante / accionamiento | Situación / conciliación |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| ELEC-001 | Área A - Preparación del material (recepción y trituración) | A-120 | Alimentador de placas | 1 | 440 | 12 | 16 | 12.2 | WEG | Equipo op; Coincidencia media |
| ELEC-002 | Área A - Preparación del material (recepción y trituración) | A-135 | Triturador primario | 1 | 440 | 100 | 125 | 103.8 | Allis Chamber-Faco / Electric inc | Equipo Operativo, rodamiento dañado requiere reemplazo y mantenimiento mayor, no hay muela fija en stock; Coincidencia alta |
| ELEC-003 | Área A - Preparación del material (recepción y trituración) | A-145 | Cinta transportadora N.º 1 | 1 | 440 | 12 | 15.37 | 12.2 | netros de longituc rodillo de cola, 1 angulo de 30", 5 rno, 1 rodillo motriz on una relación d | Cinta :Goodyear/lreductor [DODGE; Coincidencia alta |
| ELEC-004 | Área A - Preparación del material (recepción y trituración) | A-160 | Criba vibradora | 1 | 440 | 12 | 19.1 | 15.7 | Vibramech / Electric inc | Equipo Operativo, requiere mantenimietno E estructura y mantene: stock de malla y canuelas da 1/4; Coincidencia alta |
| ELEC-005 | Área A - Preparación del material (recepción y trituración) | A-170 | Triturador de cono | 1 | 440 | 100 | 125 | 103.8 | Nordberg / WEG | Equipo Operativo, con alto grado de desgaste en componentes, requiere mantenimiento mayor; Coincidencia alta |
| ELEC-006 | Área A - Preparación del material (recepción y trituración) | A-170/1 | Bomba de lubricación del cono | 1 | 440 | 2.4 | 3.9 | 3.3 | — | Sin coincidencia |
| ELEC-007 | Área A - Preparación del material (recepción y trituración) | A-175 | Cinta transportadora N.º 2 | 1 | 440 | 12 | 15.37 | 12.2 | netros de longitud lillos de impacto, 41 , 1 rodillo motriz, ! 's, angulo de 30" TXT 415 BT, ratin: 15,13, part Number / 1; Hp: 7.5; V: 220 : 1760; Frecuencia | Cinta ¿¡Goodyear/reductor [DODGE; Coincidencia alta |
| ELEC-008 | Área A - Preparación del material (recepción y trituración) | A-180 | Cinta transportadora N.º 3 | 1 | 440 | 12 | 15.37 | 12.2 | netros de longitud dillos de impacto, « ; angulo de 30%, : - Reductor: Marc: 31,9, ratio 16,13 : 244526 | Cinta 'Goodyear/reductor 'DODGE; Coincidencia alta |
| ELEC-009 | Área A - Preparación del material (recepción y trituración) | A-190 | Cinta transportadora N.º 4 | 1 | 440 | 12 | 16 | 12.2 | Cinta Goodyear / reductor DODGE | Equipo operativo; requiere reemplazo de banda; Coincidencia alta |
| ELEC-010 | Área A - Preparación del material (recepción y trituración) | A-200 | Muestreador | 1 | 440 | 0.75 | 1.7 | 0.4 | — | Sin coincidencia |
| ELEC-011 | Área A - Preparación del material (recepción y trituración) | A-300 | Alimentador de placas L2 | 1 | 440 | 12 | 16 | 12.2 | Pioneer Engineering | Equipo operativo; mantenimiento rutinario de baberos y rodillos; mantener stock de banda; Coincidencia baja |
| ELEC-012 | Área A - Preparación del material (recepción y trituración) | A-310 | Triturador primario L2 | 1 | 440 | 75 | 95 | 78.9 | — | Sin coincidencia |
| ELEC-013 | Área A - Preparación del material (recepción y trituración) | A-320 | Cinta transportadora N.º 5 L2 | 1 | 440 | 12 | 16 | 12.2 | Cinta Goodyear | Equipo operativo; mantenimiento rutinario de baberos y rodillos; mantener stock de banda; Coincidencia alta |
| ELEC-014 | Área A - Preparación del material (recepción y trituración) | A-330 | Criba vibradora L2 | 1 | 440 | 25 | 33.7 | 25.2 | Vibramect | Equipo inoperativo con alto deterioro estructural; requiere mantenimiento mayor; Coincidencia alta |
| ELEC-015 | Área A - Preparación del material (recepción y trituración) | A-340 | Triturador de cono L2 | 1 | 440 | 60 | 72.6 | 61 | — | Sin coincidencia |
| ELEC-016 | Área A - Preparación del material (recepción y trituración) | A-350 | Cinta transportadora N.º 6 L2 | 1 | 440 | 7.5 | 12.1 | 10.8 | Cinta Goodyear | Equipo operativo; mantenimiento rutinario de baberos y rodillos; mantener stock de banda; Coincidencia baja |
| ELEC-017 | Área A - Preparación del material (recepción y trituración) | A-360 | Cinta transportadora N.º 7 L2 | 1 | 440 | 9 | 16 | 12.2 | Cinta Goodyear | Equipo operativo; mantenimiento rutinario de baberos y rodillos; mantener stock de banda; Coincidencia alta |
| ELEC-018 | Área A - Preparación del material (recepción y trituración) | — | Cinta transportadora L13 | 1 | 440 | 5.5 | 10 | 8.3 | netros de longitud iciones de carga, rodillos de retorno Forque:31,9 ¡Speed d / 116,3 ¡V: 220/441 02 ¡Modelo:; 254T | Cinta ¿Goodyear/reductor ¡DODGE; Coincidencia alta |
| INV-031 | TRITURACIÓN | — | CCM - Trituración | 1 | — | — | — | — | — | Equipo operativo; necesita acondicionamiento de aire porque contiene los breakers principales; Solo inventario técnico |
| INV-002 | TRITURACIÓN - LÍNEA N° 1 | — | Tolva de alimentación de la línea 1 | 1 | — | — | — | — | Releven | Equipo operativo; Solo inventario técnico |
| INV-004 | TRITURACIÓN - LÍNEA N° 1 | — | Motor eléctrico | 1 | — | — | — | — | WEG | Equipo Operativo; Solo inventario técnico |
| INV-006 | TRITURACIÓN - LÍNEA N° 1 | — | Motor eléctrico | 1 | — | — | — | — | Electric inc | Equipo Operativo; Solo inventario técnico |
| INV-008 | TRITURACIÓN - LÍNEA N° 1 | — | Motor eléctrico | 1 | — | — | — | — | Electric inc | Equipo Operativo; Solo inventario técnico |
| INV-010 | TRITURACIÓN - LÍNEA N° 1 | — | Motor eléctrico | 1 | — | — | — | — | WEG | quipo Operativo; Solo inventario técnico |
| INV-012 | TRITURACIÓN - LÍNEA N° 1 | — | Motor reductor | 1 | — | — | — | — | — | Solo inventario técnico |
| INV-013 | TRITURACIÓN - LÍNEA N° 1 | — | Detector de metales | 1 | — | — | — | — | j | Termo Ransey; Solo inventario técnico |
| INV-015 | TRITURACIÓN - LÍNEA N° 1 | — | Motor eléctrico | 1 | — | — | — | — | 1; Hp: 7.5; V: 220 : 1760; Frecuencia | Baldor Industrial [Motor; Solo inventario técnico |
| INV-017 | TRITURACIÓN - LÍNEA N° 1 | — | Motor eléctrico | 1 | — | — | — | — | — | Solo inventario técnico |
| INV-019 | TRITURACIÓN - LÍNEA N° 1 | — | Motor eléctrico | 1 | — | — | — | — | 116,3 ¡V: 220/441 02 ¡Modelo:; 254T | Calibre; Solo inventario técnico |
| INV-020 | TRITURACIÓN - LÍNEA N° 2 | — | Tolva de alimentación de la línea 2 | 1 | — | — | — | — | — | Releven; Solo inventario técnico |
| INV-022 | TRITURACIÓN - LÍNEA N° 2 | — | Reductor | 1 | — | — | — | — | Philadelphia In Line Reducer | Equipo operativo; mantenimiento rutinario y lubricación; Solo inventario técnico |
| INV-025 | TRITURACIÓN - LÍNEA N° 2 | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-027 | TRITURACIÓN - LÍNEA N° 2 | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-029 | TRITURACIÓN - LÍNEA N° 2 | — | Motor eléctrico | 1 | — | — | — | — | — | Equipo operativo; Solo inventario técnico |
| INV-030 | TRITURACIÓN - LÍNEA N° 2 | — | Caja de control | 1 | — | — | — | — | — | Equipo operativo; necesita reubicación porque los componentes se contaminan demasiado; Solo inventario técnico |

## 5. Fichas técnicas y trazabilidad complementaria
Cada fila siguiente corresponde al ID maestro precedente. La información técnica extensa procede de la conciliación original; las inconsistencias OCR se conservan para revisión y no se interpretan como dimensiones verificadas.
| ID | Dimensiones | Fecha instalación | Requisitos técnicos / rendimiento | Origen y referencia |
|---|---|---|---|---|
| ELEC-001 | 900 de ancho x 4500 mm de largo | Dic. 2025 | Accionamiento: motor eléctrico trifásico de 25 hp - 1750 rpm, 40 volts | Ambas fuentes; inventario ID 3; pág. eléctrica 1; pág. inventario 1 |
| ELEC-002 | — | Usado, 1999 | Equipo: Capacidad: 70 toneladas/h, modelo 8050; Accionamiento: 125 hp, 1185 RPM, V 440/220, 60 HZ | Ambas fuentes; inventario ID 5; pág. eléctrica 1; pág. inventario 1 |
| ELEC-003 | 23,2 m x 945 mm | 1995 | Equipo: 123.2 mts Cinta de 28" de ancho por 58 velocidad 1.65 m/seg a 35", 1 7 ¿rodillos de impacto, 22 estacione rodillos de carga, 6 rodillos de ret Reductor: marca Dodge bd-515 «reducción de 15,4:1 | Ambas fuentes; inventario ID 11; pág. eléctrica 1; pág. inventario 2 |
| ELEC-004 | 4200 mm x 1.400 mm | 1999 | Equipo: Malla: 2 de 145 cm x 145 cm, Abertura Y", Y Alambre Ye; Accionamiento: 50 Hp., Amp 38,2 - 19 1, Volts 230-450, 1750 RPM | Ambas fuentes; inventario ID 7; pág. eléctrica 1; pág. inventario 1 |
| ELEC-005 | — | usado planta | Equipo: nturador de cono 4 FT Standar Capacidad 65 on/hora con reducciones a 3/4; Accionamiento: Modelo W21. HP: 115: Frame 404/5T ¿RPM 1175 | Ambas fuentes; inventario ID 9; pág. eléctrica 1; pág. inventario 1 |
| ELEC-006 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 1; pág. inventario — |
| ELEC-007 | 17,5 m x 976 mm | 1995 | Equipo: 17.5 mts Cinta de 26" de ancho por 36 .,velocidad 2.12 m/seg a 35", 12 rc rodillos de carga, 1 rodillo de col; 1976 mm :rodillos de retorno, 20 estacior ¿Reductor: Marca Dodge; modelo :31,9; RPM imput max 2118, ratio 1244526 AH; Accionamiento: Sín infor nación N°: M3710T; Spec: 37G813T8601 nación '230/440; Amp: 21,2-19,8/9,8; RP! 50 Hz | Ambas fuentes; inventario ID 14; pág. eléctrica 1; pág. inventario 2 |
| ELEC-008 | 13,8 m x 1,10 m | 1995 | Equipo: 13.8 mt Cinta de 36" de ancho por 28 velocidad 1.44 m/seg a 35", 9R AA NS rodillos de retorno, 14 estacione rodillo de cola, 1 rodillo motri. Dodge, modelo td 415 BT, ratir ¿RPM imput max 2118, Part Numbe; Accionamiento: 77 9 infos nación k 9 hp,1725Rpm,440v,10 amp | Ambas fuentes; inventario ID 16; pág. eléctrica 1; pág. inventario 2 |
| ELEC-009 | 31,5 m x 710 mm | — | Equipo: Cinta de 26 pulg de ancho por 66 m de longitud; velocidad 1,22 m/s a 0°; 29 estaciones a 30°; 15 rodillos de impacto; 75 rodillos de carga; 10 rodillos de retorno; reductor Dodge TXT 825T, ratio 24,62, part number 240200; Accionamiento: 10 HP; 1760 RPM; 460/230 V; 25/12,6 A; frame 216T | Ambas fuentes; inventario ID 28; pág. eléctrica 1; pág. inventario 3 |
| ELEC-010 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 1; pág. inventario — |
| ELEC-011 | — | Usada 2020 | Equipo: Banda de 42 pulg de ancho x 3,5 m | Ambas fuentes; inventario ID 21; pág. eléctrica 1; pág. inventario 3 |
| ELEC-012 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 1; pág. inventario — |
| ELEC-013 | 25,9 m x 905 mm | Usada 2020 | Equipo: Cinta de 32 pulg de ancho por 54 m de longitud; velocidad 1,44 m/s a 35; Accionamiento: 12 HP; 1720 RPM; 460 V; 15 A | Ambas fuentes; inventario ID 24; pág. eléctrica 1; pág. inventario 3 |
| ELEC-014 | 3580 x 1382 mm | Usado, 1999 | Equipo: Malla: 2 de 145 x 145 cm; abertura 3/4 pulg; diámetro de alambre 1/4 pulg | Ambas fuentes; inventario ID 23; pág. eléctrica 1; pág. inventario 3 |
| ELEC-015 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 1; pág. inventario — |
| ELEC-016 | 20,5 m x 740 mm | Usada 2020 | Equipo: Cinta de 26 pulg de ancho por 43 m de longitud; velocidad 1,99 m/s a 35; Accionamiento: 9 HP; 1725 RPM; 440 V; 10 A | Ambas fuentes; inventario ID 26; pág. eléctrica 1; pág. inventario 3 |
| ELEC-017 | 20,5 m x 740 mm | Usada 2020 | Equipo: Cinta de 26 pulg de ancho por 43 m de longitud; velocidad 1,99 m/s a 35; Accionamiento: 9 HP; 1725 RPM; 440 V; 10 A | Ambas fuentes; inventario ID 26; pág. eléctrica 1; pág. inventario 3 |
| ELEC-018 | 3,45 m x 1,38 m | 2014 | Equipo: 3,45 mt Cinta de 36" de ancho por B 'velocidad 2.07 m/seg a 0", 6 es 11.38 mis rodillo de cola, 1 rodillo motriz, : Reductor: Dodge ¡Reduce 15,13 123,79 ¡Size: TXT415AT ¡Imput spe; Accionamiento: mación Sl info NETO ¡Hp: 15 ¡RPM:1750 ;Amp: 36, "Frecuencia: 60 Hz ¡Serial: P25G4 | Ambas fuentes; inventario ID 18; pág. eléctrica 1; pág. inventario 2 |
| ELEC-019 | Dimensiones cilindro, diámetro 2310 mm longitud 4267 mm | abr-88 | Equipo: Capacidad 40 toneladas/hora Revestimiento interno d goma, Turbo acople, marca VOITH, modelo 750 TVA Caja reductora, Marca BEW, modelo SBN 22 100 HSN ratio 5962 1, Motor de giro lonto Marca EBERLE, HI 5,3, 460 VAC, 1128 RPM, Frame D 132M, 60 Mz, Fran olectromagnótico DUPAR NS 160, Reductor giro lento BEW 8/4 relación 1201, 1 Acople 160/5,8 FLEX, Piñó! helicoidal de 21 Dientes, 1.5 DP, 10* N° parta M2204 DIA, 2 Rodamientos del trunnion SKF 239/60( CAK/W33 - manguito OHM39/600H, 2 Rodamientos 23230 CCW/33, 2 Chumacera SNA 530, Coron: helicoidal de 184 dientes, 15 DP, 10%", 22,8 RPM NI parte M2204-01A o; Accionamiento: Motor principal 400 Hp, 460 VAC, 1190 RPM, 60 Hz FRAME DISS5LX | Ambas fuentes; inventario ID 42; pág. eléctrica 1; pág. inventario 5 |
| ELEC-020 | Dimensiones cilindro, diámetro 2310 mm longitud 4267 mm | abr-88 | Equipo: Capacidad 40 toneladas/hora Revestimiento interno d goma, Turbo acople, marca VOITH, modelo 750 TVA Caja reductora, Marca BEW, modelo SBN 22 100 HSN ratio 5962 1, Motor de giro lonto Marca EBERLE, HI 5,3, 460 VAC, 1128 RPM, Frame D 132M, 60 Mz, Fran olectromagnótico DUPAR NS 160, Reductor giro lento BEW 8/4 relación 1201, 1 Acople 160/5,8 FLEX, Piñó! helicoidal de 21 Dientes, 1.5 DP, 10* N° parta M2204 DIA, 2 Rodamientos del trunnion SKF 239/60( CAK/W33 - manguito OHM39/600H, 2 Rodamientos 23230 CCW/33, 2 Chumacera SNA 530, Coron: helicoidal de 184 dientes, 15 DP, 10%", 22,8 RPM NI parte M2204-01A o; Accionamiento: Motor principal 400 Hp, 460 VAC, 1190 RPM, 60 Hz FRAME DISS5LX | Ambas fuentes; inventario ID 42; pág. eléctrica 1; pág. inventario 5 |
| ELEC-021 | Altura 1070 rom, ancho 857 rm, largo 1506 mrn | jul-14 | Equipo: Bomba centrifuga, marca warmnan, trame F, modelo AH proceso lodo, tamaño 8 yx 6, diámetro de flange de alimentación 8, diámetro de flange de descarga 6 rotación máxima 1000 RPM, potencia requerida 11£ IA IMDELAES mAs a sahara AR mba nmitial AAN lla; Accionamiento: Motor marca Industrial Electric, modelo V/WW/1EM100-18- 405T, 100 hp. 1750 rpm, protección IP55 | Ambas fuentes; inventario ID 44; pág. eléctrica 1; pág. inventario 5 |
| ELEC-022 | Altura 1070 mm, ancho B57 rm, largo 1506 mrn | jul-14 | Equipo: S0mba centriuga, marca warman, Irarme , modelo Ar, roceso lodo, tamaño E x 6, diámetro de flange de alimentación £, diámetro de flange de descarga 6, 'otación máxima 1000 RPM, potencia requerida 11£ MATE LISTS * mAscieona anna AÑ] roba snmital "MIEM lla; Accionamiento: notor trfasico frame 405T, 115 hp. 1750 rpm, rotección IP55 | Ambas fuentes; inventario ID 47; pág. eléctrica 1; pág. inventario 5 |
| ELEC-023 | Dimens 38 :diámetr longituc | mr. 'abr | Equipo: Revestimiento interno de goma, 'VOITH, modelo 750 TVA, Caja re modelo SBN 22 100 HSN, ratio ones cilindro,:lento: Marca EBERLE; HP 5,3; « , 2310 mm,Frame D 132M, 60 Hz, Fre 4267 mm :DUPAR NS 160, Reductor giro le 1120:1, 1 Acople 160/5,8 FLEX, F «Dientes, 15 DP, 10% N° p ¡Rodamientos del trunnion SKF; Accionamiento: mación ¿Motor principal 350 Hp, 460 VA! "FRAME D3IS55LX | Ambas fuentes; inventario ID 40; pág. eléctrica 1; pág. inventario 4 |
| ELEC-024 | Dimens 38 :diámetr longituc | mr. 'abr | Equipo: Revestimiento interno de goma, 'VOITH, modelo 750 TVA, Caja re modelo SBN 22 100 HSN, ratio ones cilindro,:lento: Marca EBERLE; HP 5,3; « , 2310 mm,Frame D 132M, 60 Hz, Fre 4267 mm :DUPAR NS 160, Reductor giro le 1120:1, 1 Acople 160/5,8 FLEX, F «Dientes, 15 DP, 10% N° p ¡Rodamientos del trunnion SKF; Accionamiento: mación ¿Motor principal 350 Hp, 460 VA! "FRAME D3IS55LX | Ambas fuentes; inventario ID 40; pág. eléctrica 1; pág. inventario 4 |
| ELEC-025 | 510041200 | — | Equipo: 3omba china venical Hevestimiento Caucho natural. mpulsor revestido en caucho natural, Caudal (q) litros / vegundo (Vs) ; metros cúbicos! hora (rm3/n) 100 m3/n, Mura 12,2, mts, N° de serie: 2002-793-80-3, Velocidad lel impulsor 1071 RPM, Soporte para motor. Protector la coleas Y commaas; Accionamiento: Motor con características: potencia 5,5 kw, power 7,5 1p, voltaje 460, velocidad 1760 rpm, frame 2151 | Ambas fuentes; inventario ID 50; pág. eléctrica 1; pág. inventario 5 |
| ELEC-026 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 1; pág. inventario — |
| ELEC-027 | nación 1 Qn | lora N°:Sin info | Equipo: Cinta de 30" de ancho por 14 EA ¡Velocidad m/seg a 0". » 24 Ro rodillos de carga, 4 rodillos de ret +1 rodillo motriz, 15 estaciones de | Ambas fuentes; inventario ID 34; pág. eléctrica 1; pág. inventario 4 |
| ELEC-028 | Dimens 'Diámet 'Longitu | 3 :199 | Equipo: Marca Marcy, Volumen de alirr «Capacidad 80 T/H, Rotación L.H, nes cilindro::en goma, fabricante metso, Emil ) 10 pies x:spider o araña 32VC 1000 N° di 20 pies, :32VC1000 element w/2-QRV N' c ¡seal N° de parte 409513, hub :drum 506930; Accionamiento: Motor, marca WESTINGHOUSE E, HP: 1000, 60 Hz, serial 1581P212 exit volt 250, F.S 1,15 PH 3: e frame HR-6 | Ambas fuentes; inventario ID 38; pág. eléctrica 1; pág. inventario 4 |
| ELEC-029 | 510041200 | — | Equipo: 3omba china venical Hevestimiento Caucho natural. mpulsor revestido en caucho natural, Caudal (q) litros / vegundo (Vs) ; metros cúbicos! hora (rm3/n) 100 m3/n, Mura 12,2, mts, N° de serie: 2002-793-80-3, Velocidad lel impulsor 1071 RPM, Soporte para motor. Protector la coleas Y commaas; Accionamiento: Motor con características: potencia 5,5 kw, power 7,5 1p, voltaje 460, velocidad 1760 rpm, frame 2151 | Ambas fuentes; inventario ID 50; pág. eléctrica 1; pág. inventario 5 |
| ELEC-030 | — | — | Equipo: Motor-reductor Modelo N° 1133, Posición ventical Velocidad de salida 41 RPM, Motor, 11 Kw, voltaje 460 protección IP55, frame 160, montaje Vi, velocidad 1760 RPM, Eje largo 3700 mm, diámetro 90 mm. " Aspas lower, impeller type HA703, blades bolted, hut welded, stabilisers no. 3 Aspas upper, impeller type HABOO, blades bolted, hub welded, stabilizers no | Ambas fuentes; inventario ID 61; pág. eléctrica 2; pág. inventario 6 |
| ELEC-031 | — | — | Equipo: Motor-reductor Modelo N° 1133, Posición vertici ¡Velocidad de salida 41 RPM, Motor, 11 Kw, voltaje 46 :protección 1P55, frame 160, montaje Vi, velocid: 1760 RPM, Eje largo 3700 mm, diámetro 90 mm. ¡«Aspas lower, impeller type HA703, blades bolted, hi 'welded, stabilisers no. 3 Aspas upper, impeller ty; :HAB80O, blades bolted, hub welded, stabilizers no | Ambas fuentes; inventario ID 63; pág. eléctrica 2; pág. inventario 7 |
| ELEC-032 | Altura 1070 mn ancho 857 mm, larg 11506 mm | — | Equipo: Bomba centrifuga, marca warman, frame F, modelo Al proceso lodo, tamaño 8 x 6, diámetro de flange « "alimentación 8, diámetro de flange de descarga rotación máxima 1000 RPM, potencia requerida 11 ¿Hp/25HP, máxima cabeza 40 mts, caudal 200 l/s; Accionamiento: Motor: marca EBERLE, modelo 200 M4/Y1, seri :3637060, 30 Kw, 40 Hp, 1770 RPM, voltaje 201 :230/460, amperaje 101,7/46 | Ambas fuentes; inventario ID 64; pág. eléctrica 2; pág. inventario 7 |
| ELEC-033 | Mesa 3 mts2 | abr-88 | Equipo: Warca: DUelxor ¡echnik, ivialla Upo tela micrón 8U «poliéster, longitud 8 mts, ancho 1,9 mts. 9 Rodillos ¿tambor 127 mm, longitud del tambor 2032 cm, longitu «del eje 2286 cm, 4 del eje 30 mm. Material metálico co revestimiento de goma. 18 chumaceras P-206 de 3 'mm. Rodillo motriz, 4 tambor 33 mm, lonaitud de | Ambas fuentes; inventario ID 66; pág. eléctrica 2; pág. inventario 7 |
| ELEC-034 | Mesa 3 mts2 | abr-88 | Equipo: Warca: DUelxor ¡echnik, ivialla Upo tela micrón 8U «poliéster, longitud 8 mts, ancho 1,9 mts. 9 Rodillos ¿tambor 127 mm, longitud del tambor 2032 cm, longitu «del eje 2286 cm, 4 del eje 30 mm. Material metálico co revestimiento de goma. 18 chumaceras P-206 de 3 'mm. Rodillo motriz, 4 tambor 33 mm, lonaitud de | Ambas fuentes; inventario ID 66; pág. eléctrica 2; pág. inventario 7 |
| ELEC-035 | Diámetro 18.3 mts ¡Área 262.8 m' 'Altura, lado recto : mts | abr-88 | Equipo: Capacidad 75 toneladas de solido | Ambas fuentes; inventario ID 67; pág. eléctrica 2; pág. inventario 7 |
| ELEC-036 | Tamaño 4 x 3 | — | Equipo: Bomba para lodo, marca: warman, modelo 0-AH tamaño 4 x 3, Serial: WH98-09-3355, Frame D, Tip AH Horizontal, centrifuga, para lodo, impulsor de gom. R55. Revestimiento de goma R55. Sello por medio d empaques y agua. Empaquetadura trenzada grafitad: de1/2" Protector de poleas y correas. Rango di velocidad entre 880 y 1100 rpm. 160 m3/h trabaja col | Ambas fuentes; inventario ID 69; pág. eléctrica 2; pág. inventario 7 |
| ELEC-037 | Tamaño 4 x 3 | — | Equipo: Bomba para lodo, marca: warman, modelo 0-AH tamaño 4 x 3, Serial: WH98-09-3355, Frame D, Tip AH Horizontal, centrifuga, para lodo, impulsor de gom. R55. Revestimiento de goma R55. Sello por medio d empaques y agua. Empaquetadura trenzada grafitad: de1/2" Protector de poleas y correas. Rango di velocidad entre 880 y 1100 rpm. 160 m3/h trabaja col | Ambas fuentes; inventario ID 69; pág. eléctrica 2; pág. inventario 7 |
| ELEC-038 | 5100 x 1200 mm | — | Equipo: Bomba vertical con revestimiento de caucho natural; impulsor revestido; caudal 100 m3/h; altura 12,2 m; velocidad del impulsor 1071 RPM; soporte para motor y protector de poleas y correas; Accionamiento: Potencia 11 kW / 15 HP; 460 V; 1760 RPM; frame 215T | Ambas fuentes; inventario ID 70; pág. eléctrica 2; pág. inventario 8 |
| ELEC-039 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 2; pág. inventario — |
| ELEC-040 | olumen 230 m* : livel Máximo 6500: im Diámetro 6500:, im Elevación 7000;" m | Í 998 | Equipo: n información Re | Ambas fuentes; inventario ID 102; pág. eléctrica 2; pág. inventario 11 |
| ELEC-041 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 2; pág. inventario — |
| ELEC-042 | olumen 230 m? : Nivel Máximo 6500; Im "A diámetro 6500 mm :1 -levación 7000 mm | 998 Al | Equipo: alla Kambalda diámetro: malla de acero inoxidable de: Re nm de espesor, 0,8 mm de abertura | Ambas fuentes; inventario ID 103; pág. eléctrica 2; pág. inventario 11 |
| ELEC-043 | — | — | Equipo: Motor-reductor: Modelo: 1163, Posición: vertical, Outpu speed 27 RPM. Factor de servicio: 1.50, Motor: 40 Hp 460 voltaje, IP55 protección, 200 Frame, V1 Montaje speed 1760 RPM. Peso del agitador 1901 KG. Torque 5659 Nm, Load Axial 5980 N, Eje: Diámetro 100 mm ongitud 5250 mm, 3 Aspas lower: impeller type 1A703, blades Bolted, Hub welded, stabiliser no. 3 Aspas Upper: impeller type HA800, blades Bolted, Hut velded, stabiliser no | Ambas fuentes; inventario ID 106; pág. eléctrica 2; pág. inventario 12 |
| ELEC-044 | Volumen 230 m* vel Máximo 6500: m Diámetro 6500.M m Elevación 7000'1 m | 998 y "n :N | Equipo: illa Kambalda diámetro: malla de acero inoxidable de nm de espesor, 0,8 mm de abertura o | Ambas fuentes; inventario ID 104; pág. eléctrica 2; pág. inventario 11 |
| ELEC-045 | Sin información 1 1 1 , a a , L | — | Equipo: Motor-reductor: Modelo: 1163, Posición: vertical, Output peed 27 RPM. Factor de servicio: 1.50, Motor: 40 Hp, 160 voltaje, IP55 protección, 200 Frame, V1 Montaje, peed 1760 RPM. Peso del agitador 1901 KG. Torque 1659 Nm, Load Axial 5980 N, Eje: Diámetro 100 mm, ongitud 5250 mm, 3 Aspas lower. impeller type 1A703, blades Bolted, Hub welded, stabiliser no. 3 ispas Upper: impeller type HA800, blades Bolted, Hub velded, stabiliser no | Ambas fuentes; inventario ID 107; pág. eléctrica 2; pág. inventario 12 |
| ELEC-046 | Volumen 230 m: vel Máximo 6500: m Diámetro 6500;M m Elevación 7000'1 m | A 198 7 TM "nm | Equipo: lla Kambalda diámetro: malla de acero inoxidable de am de espesor, 0,8 mm de abertura | Ambas fuentes; inventario ID 105; pág. eléctrica 2; pág. inventario 11 |
| ELEC-047 | o Sin información | sin , nformación : S | Equipo: Aotor-reductor: Modelo: 1163, Posición: vertical, Output peed 27 RPM. Factor de servicio: 1.50, Motor: 40 Hp, 60 voltaje, IP55 protección, 200 Frame, V1 Montaje, peed 1760 RPM. Peso del agitador 1901 KG. Torque 659 Nm, Load Axial 5980 N, Eje: Diámetro 100 mm, mgitud 5250 mm, 3 Aspas lower: impeller type lA703, blades Bolted, Hub welded, stabiliser no. 3 spas Upper: impeller type HA800, blades Bolted, Hub: relded, stabiliser no | Ambas fuentes; inventario ID 108; pág. eléctrica 2; pág. inventario 12 |
| ELEC-048 | Mura 668 mm, ncho 492 mm, largo: 1021 mm | K K 4 4 ' In nformación ' . 4 1 | Equipo: jomba centrifuga, marca warman, frame D, modelo 1H, proceso lodo, tamañao 6 x 4, diámetro de flange de limentación 6, diámetro de flange de descarga 4, otación máxima 1350 RPm, potencia requerida 115/25 Ip, máxima cabeza 50 mts, caudal máximo 80 l/s; Accionamiento: Motor marca EMERSON, 50 hp. 1750 RPM, 284T: ramo, 230/460 Volt, 56/28 amp | Ambas fuentes; inventario ID 115; pág. eléctrica 2; pág. inventario 13 |
| ELEC-049 | Mura 6689 mm,' ncho 492 mm, largo: 021 mm | in ' Mormación | Equipo: lomba centrifuga, marca warman, frame D, modelo! HH, proceso lodo, tamañao 6 x 4, diámetro de flange de' limentación 6, diámetro de flange de descarga 4, ación máxima 1350 RPm, potencia requerida 115/25; Ip, máxima cabeza 50 mts, caudal máximo 80 Vs; Accionamiento: totor eléctrico trifanico de 00 Hp - 1750 rpm | Ambas fuentes; inventario ID 117; pág. eléctrica 2; pág. inventario 13 |
| ELEC-050 | B «ln sn 00x1200 : A ¿e "de | K 1] > ' 1] > in 5 formación + : 1] 4 4 J | Equipo: mba china vertical Revestimiento Caucho natural,: Julsor revestido en caucho natural, Caudal (q) litros ¿BOI jundo (l/s) ; metros cúbicos! hora (m3/h) 100 m3/h,:ZPF ¿ra 12,2, mts, N° de soria: 2002-703-80-3, Volocidad:ZD1 impulsor 1071 RPM, Soporte para motor. Protector:pun poleas y correas; Accionamiento: tor eléctrico de 7,5 hp a 1750 rpm, 440 volts, "wo | Ambas fuentes; inventario ID 119; pág. eléctrica 2; pág. inventario 14 |
| ELEC-051 | — | — | Equipo: Motor-reductor modelo 1133; posición vertical; salida 44 RPM; factor de servicio 1,79; motor 20 HP, 460 V, IP55, frame 160, montaje V1, 1760 RPM; peso 751 kg; torque 1938 Nm; carga axial 2954 N; eje 141 mm x 6800 mm; tres juegos de aspas | Ambas fuentes; inventario ID 131; pág. eléctrica 2; pág. inventario 15 |
| ELEC-052 | q $ " Sin información ' ? st sh st | 1] sin ; nformación : 1] 4 : s | Equipo: otor-reductor: Modelo: 1133, Posición: vertical: utput speed 44 RPM. Factor de servicio: 1.79; Motor: ) Hp, 460 voltaje, IP55 protección, 160 Frame, vi: ontaje, speed 1760 RPM. Peso del agitador 751 KG.; rque 1938 Nm. Load Axial 2954 N. Eje: Diámetro: 1 mm, longitud 6800 mm. 3 Aspas lower: impeller:Mi pe HA703, blades Bolted, Hub welded, stabiliser yes.; Aspas Upper: impeller type HA800, blades Bolted,: Jb welded, stabiliser no. 3 Aspas middle: impeller: pe HA703, blades Bolted, Hub welded, stabiliser no | Ambas fuentes; inventario ID 132; pág. eléctrica 2; pág. inventario 16 |
| ELEC-053 | N :C :2 'N «T in información :1 sy :3 ¡H | 1 * * * * * * * * o * in + . or formación + * * 1] * 1] * * * .* * 1 | Equipo: tor-reductor: Modelo: 1133, Posición: vertical, itput speed 44 RPM. Factor de servicio: 1.79; Motor: Hp, 460 voltaje, IP55 protección, 150 Frame, V1: ntaje, speed 1760 RPM. Peso del agitador 751 KG.! rque 1938 Nm. Load Axial 2954 N. Eje: Diámetro: 1 mm, longitud 6800 mm. 3 Aspas lower. impeller:Mix e HA703, blades Bolted, Hub welded, stabiliser yes.: Aspas Upper: impeller type HA800, blades Bolted,: b welded, stabiliser no. 3 Aspas middle: impeller: e HA703, blades Bolted, Hub welded, stabiliser no | Ambas fuentes; inventario ID 133; pág. eléctrica 2; pág. inventario 16 |
| ELEC-054 | M ¡20 :M «Ta 1 información ¡14 y :3 ¿Hi | n : 'ormación Ss | Equipo: tor-reductor. Modelo: 1133, Posición: vertical,: tput speed 44 RPM. Factor de servicio: 1.79; Motor: Hp, 460 voltaje, IP55 protección, 160 Frame, V1: ntaje, speed 1760 RPM. Peso del agitador 751 KG.! que 1938 Nm. Load Axial 2954 N. Eje: Diámetro: mm, longitud 6800 mm. 3 Aspas lower. impeller; Mod » HA703, blades Bolted, Hub welded, stabiliser yes.: ispas Upper. impeller type HA800, blades Bolted,: ) welded, stabiliser no. 3 Aspas middle: impeller. , HA7O3, blades Bolted, Hub welded, stabiliser no | Ambas fuentes; inventario ID 134; pág. eléctrica 2; pág. inventario 16 |
| ELEC-055 | s( 1 sh 1] in información +1 st 12 4 sE | sn ) Mormación +: r , , r ' ' ' ' ' - 4 | Equipo: otor-reductor: Modelo: 1133, Posición: vertical, utput speed 44 RPM. Factor de servicio: 1.79; Motor: ) Hp, 460 voltaje, IP55 protección, 160 Frame, V1! ontaje, speed 1760 RPM. Peso del agitador 751 KG.! que 1938 Nm. Load Axial 2954 N. Eje: Diámetro: 11 mm, longitud 6800 mm. 3 Aspas lower. impeller;Mi 98 HA703, blades Bolted, Hub welded, stabiliser yes.' Aspas Upper. impeller type HA800, blades Bolted,: ¡b welded, stabiliser no. 3 Aspas middle: impeller; e HA703, blades Bolted, Hub welded, stabiliser no | Ambas fuentes; inventario ID 135; pág. eléctrica 2; pág. inventario 17 |
| ELEC-056 | N ¡0 12 :N > ,T in información 1 1b 13 ¿H | in + e formación ; ' ' ' ' ' ' ' 4 ' y | Equipo: tor-reductor: Modelo: 1133, Posición: vertical, itput speed 44 RPM. Factor de servicio: 1.79; Motor; Hp, 460 voltaje, IP55 protección, 160 Frame, v1! mtaje, speed 1760 RPM. Peso del agitador 751 KG.: rque 1938 Nm. Load Axial 2954 N. Eje: Diámetro; y, 1 mm, longitud 6800 mm. 3 Aspas lower: impeller; e HA703, blades Bolted, Hub welded, stabiliser yes.! Aspas Upper: impeller type HA800, blades Bolted,: b welded, stabiliser no. 3 Aspas middle: impeller; e HA703, blades Bolted, Hub welded, stabiliser no | Ambas fuentes; inventario ID 136; pág. eléctrica 2; pág. inventario 17 |
| ELEC-057 | N ds 2 :M n información e ¿ty 13 ¿H :ty | in : e formación | Equipo: tor-reductor. Modelo: 1133, Posición: ventical,: tput speed 44 RPM. Factor de servicio: 1.79; Motor: Hp, 460 voltaje, IP55 protección, 160 Frame, V1; ntaje, speed 1760 RPM. Peso del agitador 751 KG.! que 1938 Nm. Load Axial 2954 N. Eje: Diámetro; y. 4 í mm, longitud 6800 mm. 3 Aspas lower. impeller; e HA703, blades Bolted, Hub welded, stabiliser yes.' aspas Upper: impeller type HAB8O0O, blades Bolted,: b welded, stabiliser no. 3 Aspas middle: impeller; e HA703, blades Bolted, Hub welded, stabiliser no | Ambas fuentes; inventario ID 137; pág. eléctrica 2; pág. inventario 17 |
| ELEC-058 | — | — | Equipo: Motor-reductor modelo 1133; posición vertical; salida 44 RPM; factor de servicio 1,79; motor 20 HP, 460 V, IP55, frame 160, montaje V1, 1760 RPM; peso 751 kg; torque 1938 Nm; carga axial 2954 N; eje 141 mm x 6800 mm; tres juegos de aspas | Ambas fuentes; inventario ID 138; pág. eléctrica 3; pág. inventario 18 |
| ELEC-059 | — | — | Equipo: Motor-reductor modelo 1133; posición vertical; salida 44 RPM; factor de servicio 1,79; motor 20 HP, 460 V, IP55, frame 160, montaje V1, 1760 RPM; peso 751 kg; torque 1938 Nm; carga axial 2954 N; eje 141 mm x 6800 mm; tres juegos de aspas | Ambas fuentes; inventario ID 139; pág. eléctrica 3; pág. inventario 18 |
| ELEC-060 | — | — | Equipo: Motor-reductor modelo 1133; posición vertical; salida 44 RPM; factor de servicio 1,79; motor 20 HP, 460 V, IP55, frame 160, montaje V1, 1760 RPM; peso 751 kg; torque 1938 Nm; carga axial 2954 N; eje 141 mm x 6800 mm; tres juegos de aspas | Ambas fuentes; inventario ID 140; pág. eléctrica 3; pág. inventario 18 |
| ELEC-061 | — | — | Equipo: Bomba vertical con revestimiento de caucho natural; impulsor revestido; caudal 100 m3/h; altura 12,2 m; velocidad del impulsor 1071 RPM; soporte para motor y protector de poleas y correas; Accionamiento: Motor eléctrico 5 HP, 1750 RPM, 440 V | Ambas fuentes; inventario ID 141; pág. eléctrica 3; pág. inventario 18 |
| ELEC-062 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural Impulsor revestido en caucho natural, Caudal (q) litros segundo (Vs) ; metros cúbicos! hora (m3/h) 100 m3/h Altura 12,2, mts, N° de serio 2002-793-80-3, Volocidac dol impulsor 1071 RPM, Soporte para motor Protecto de poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 143; pág. eléctrica 3; pág. inventario 19 |
| ELEC-063 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural Impulsor revestido en caucho natural, Caudal (q) litros segundo (Vs) ; metros cúbicos/ hora (m3) 100 m3Nn Altura 12,2, mts, N° de serio. 2002-793-80-3, Volocidac dol impulsor 1071 RPM, Soporte para motor. Protecto: de poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 145; pág. eléctrica 3; pág. inventario 19 |
| ELEC-064 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural, Impulsor revestido en caucho natural, Caudal (q) litros / segundo (Vs) ; metros cúbicos/ hora (m3M) 100 m3/h, Altura 12,2, mts, N° de sorio: 2002-793-80-3, Volocidad del impulsor 1071 RPM, Soporte para motor. Protector de poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 147; pág. eléctrica 3; pág. inventario 19 |
| ELEC-065 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural, impulsor revestido en caucho natural, Caudal (q) litros / segundo (Vs) ; metros cúbicos! hora (m3/h) 100 m3/h, Altura 12,2, mts, N° de soria: 2002-793-80-3, Volocidad lol impulsor 1071 RPM, Soporte para motor. Protector lo poleas y correas; Accionamiento: notor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 149; pág. eléctrica 3; pág. inventario 19 |
| ELEC-066 | in información 1 1 1 1 1 ó | sn . mMormación + ' - , 1] | Equipo: Jomba china vertical Revestimiento Caucho natural, mpulsor revestido en caucho natural, Caudal (q) litros / egundo (Vs) , motros cúbicos/ hora (m3/h) 100 m3/h.,. itura 12,2, mts, N° do sorío: 2002-793-80-3, Velocidad: lol impulsor 1071 RPM, Soporte para motor Protector: lo poleas y corroas; Accionamiento: notor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 151; pág. eléctrica 3; pág. inventario 19 |
| ELEC-067 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural Impulsor revestido en caucho natural, Caudal (q) litros segundo (ls) ; metros cúbicos! hora (m3/h) 100 m3/h Altura 12,2, mts, N° de serie: 2002-793-80-3, Velocidar del impulsor 1071 RPM, Soporte para motor. Protecto de poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 153; pág. eléctrica 3; pág. inventario 20 |
| ELEC-068 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural Impulsor revestido en caucho natural, Caudal (q) litros . segundo (l/s) ; metros cúbicos/ hora (m3/h) 100 m3/h Altura 12,2, mts, N° de serie: 2002-793-80-3, Velocidac del impulsor 1071 RPM, Soporte para motor. Protecto: de poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 155; pág. eléctrica 3; pág. inventario 20 |
| ELEC-069 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural. Impulsor revestido en caucho natural, Caudal (q) litros ; segundo (l/s) ; metros cúbicos! hora (m3/h) 100 m3/h, Altura 12,2, mts, N° de serie: 2002-793-80-3, Velocidad del impulsor 1071 RPM, Soporte para motor. Protector de poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 157; pág. eléctrica 3; pág. inventario 20 |
| ELEC-070 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural, Impulsor revestido en caucho natural, Caudal (q) litros / segundo (Vs) ; metros cúbicos! hora (m3/h) 100 m3/h, Altura 12,2, mts, N° de serie: 2002-793-80-3, Velocidad del impulsor 1071 RPM, Soporte para motor. Protector de poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 159; pág. eléctrica 3; pág. inventario 20 |
| ELEC-071 | 5100x1200 | — | Equipo: Bomba de transferencia de Carbón vertical: Marca SVEDALA SALA PUMP, modelo STGVA 150-33WFR MS/HI CHROME, velocidad de la bomba 8523 RPM, caudal 600 Its/min, revestida en goma. Motor. 5 Hp se implanta mejora con motor de 7,5 HP, velocidad 1750 RPM, voltaje 230/460, frecuencia 60 Hz, frame 184T, peso 100 lbs; Accionamiento: Motor eléctrico 12 HP, 1750 RPM, 440 V | Ambas fuentes; inventario ID 161; pág. eléctrica 3; pág. inventario 20 |
| ELEC-072 | 1800 x 3300 mm | 04/04/2015 | Equipo: Modelo VDS 612-6M; vibrador CD12-20100 de 9 HP; área de cribado 6 x 12 pies; inclinación 5°; movimiento lineal; 5,8 mm x 900 cpm; peso 5454 kg; dos motores 460 V, 3 ph, 60 Hz; paneles modulares de poliuretano | Ambas fuentes; inventario ID 163; pág. eléctrica 3; pág. inventario 21 |
| ELEC-073 | — | — | — | Ambas fuentes; inventario ID 164; pág. eléctrica 3; pág. inventario 21 |
| ELEC-074 | Altura 668 mm; ancho 492 mm; largo 1021 mm | — | Equipo: Bomba centrífuga Warman frame F, modelo AH, proceso lodo, tamaño 8 x 6; alimentación 8 pulg; descarga 6 pulg; Accionamiento: Motor eléctrico trifásico 200 HP, 3500 RPM, 440 V | Ambas fuentes; inventario ID 165; pág. eléctrica 3; pág. inventario 21 |
| ELEC-075 | Altura 668 mm; ancho 492 mm; largo 1021 mm | — | Equipo: Bomba centrífuga Warman frame F, modelo AH, proceso lodo, tamaño 8 x 6; alimentación 8 pulg; descarga 6 pulg; Accionamiento: Motor eléctrico trifásico 200 HP, 3500 RPM, 440 V | Ambas fuentes; inventario ID 167; pág. eléctrica 3; pág. inventario 21 |
| ELEC-076 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 3; pág. inventario — |
| ELEC-077 | 915 x 2440 | — | Equipo: Criba vibratoria, modelo DFS-38, marca SIZETEC. INC screem media urethane modular screens. vibrato motor (1) kee 24-4 (1.5 HP), power supply 230/450V x : PH x 60 HZ, power imput total 4.0 amp, stroke recuency 3.0 mm x 1800 cpm (5.4 g) | Ambas fuentes; inventario ID 171; pág. eléctrica 3; pág. inventario 22 |
| ELEC-078 | 1596 x 1300 mm | — | Equipo: Criba Modelo: DFS 36, Power supply 230/460V x 3 PH « 60 Hz. Power imput 4.0 amp, AT 460 V, Stroke x Frecuency 3.5 mm x 1800 CPM (5.4 G), Vibrating notion 45* Liner stroke, Dynamic load 282 Kg. 2 Moto! vibrador modelo KEE 24-4, 1.5 HP | Ambas fuentes; inventario ID 178; pág. eléctrica 3; pág. inventario 22 |
| ELEC-079 | — | — | Equipo: Tipo M10-MFG serie 30100-49641, 21 placas de acero para calentamiento max. Entrada columna. Desinc lemp: 135 *C, Steam: S1->S2, Water. S3=>S4. Bolts 24M. Caudal: 833 Kg/h Steam. 5400 Kg/h wáter. Temp program: 130 a 126 *C steam, 30 a 110 *C water Pressure drop: 31,05 KPA steam, 3,25 KPA water Volumen liquid 5 Its steam y 5 Its water. Material de las placas ANSI 316. Espesor de las Plcas 0,50 mm. Material de las juntas EPDM steam, CLIP-ON wáter- Superficie de transmisión de calor 1,98 m2 | Ambas fuentes; inventario ID 175; pág. eléctrica 3; pág. inventario 22 |
| ELEC-080 | 1596 x 1300 mm | — | Equipo: Criba Modelo: DFS 36, Power supply 230/460V x 3 PH « 60 Hz. Power imput 4.0 amp, AT 460 V, Stroke x Frecuency 3.5 mm x 1800 CPM (5.4 G), Vibrating notion 45* Liner stroke, Dynamic load 282 Kg. 2 Moto! vibrador modelo KEE 24-4, 1.5 HP | Ambas fuentes; inventario ID 178; pág. eléctrica 3; pág. inventario 22 |
| ELEC-081 | Diametro 36 x 6,5 mts de altura | 1998 | Equipo: vapacidad 1,5 Toneladas, temperatura máxima de rabajo 140 | Ambas fuentes; inventario ID 172; pág. eléctrica 3; pág. inventario 22 |
| ELEC-082 | — | — | Equipo: Serie 88/219 tipo 3F460230/2T Capacidad 136 Kg/n, 2 zonas 80Kw y 150 Kw, temperalura de trabajo 900 *C | Ambas fuentes; inventario ID 179; pág. eléctrica 3; pág. inventario 22 |
| ELEC-083 | 3 x 3 | 2005 | Equipo: Bomba Warman horizontal centrífuga 3 x 3, impulsor A-05 sin revestimiento; caudal 40-80 L/s; altura 40-50 m; impulsor abierto de acero inoxidable; Accionamiento: EBERLE 9,4 kW, 12,5 HP, 1760 RPM, 60 Hz, 230/460 V, 29,4/14,6 A | Ambas fuentes; inventario ID 180; pág. eléctrica 3; pág. inventario 23 |
| ELEC-084 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natural impulsor revestido en caucho natural, Caudal (q) litros . segundo (Vs) ; metros cúbicos! hora (m3/h) 100 m3/h Altura 12,2, mts, N° de serie: 2002-793-80-3, Velocidac del impulsor 1071 RPM, Soporte para motor. Protecto: Je poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Ambas fuentes; inventario ID 173; pág. eléctrica 3; pág. inventario 22 |
| ELEC-085 | — | oct-25 | Equipo: Caldera Continental de 100 HP | Ambas fuentes; inventario ID 184; pág. eléctrica 3; pág. inventario 23 |
| ELEC-086 | — | 2020 | Equipo: Fulton Fud-Fired Steams Boiler, modelo ICS 60, capacidad 2070 lb/h, 220 V, 3 ph, 6,8 A; máximo 18 GPH; 230 psi; quemador de gasoil; motor 4 HP | Ambas fuentes; inventario ID 185; pág. eléctrica 3; pág. inventario 23 |
| ELEC-087 | — | — | Accionamiento: Motor 5 HP, 1750 RPM | Ambas fuentes; inventario ID 182; pág. eléctrica 3; pág. inventario 23 |
| ELEC-088 | — | 2021 | Equipo: Bomba Flowserve 2 x 1 1/4 pulg, caudal 3 m3; carcasa en acero inoxidable; Accionamiento: Motor eléctrico trifásico 3 HP, 3500 RPM | Ambas fuentes; inventario ID 209; pág. eléctrica 3; pág. inventario 25 |
| ELEC-089 | — | — | Equipo: Tipo M10-MFG serie 30100-76951, 9 placas de acero, para pre-calentamiento de solución. Entrada columna | Ambas fuentes; inventario ID 176; pág. eléctrica 3; pág. inventario 22 |
| ELEC-090 | — | — | Equipo: Columna con 5 cámaras divididas en secciones de 5 m x 1,75 m | Ambas fuentes; inventario ID 93; pág. eléctrica 3; pág. inventario 10 |
| ELEC-091 | 3 x 3 | 2005 | Equipo: Bomba Warman horizontal centrífuga 3 x 3, impulsor A-05 sin revestimiento; caudal 40-80 L/s; altura 40-50 m; para solución ácida y sólidos en suspensión de 1-4 mm; impulsor abierto de acero inoxidable; Accionamiento: EBERLE 9,4 kW, 12,5 HP, 1760 RPM, 60 Hz, 230/460 V, 29,4/14,6 A | Ambas fuentes; inventario ID 94; pág. eléctrica 3; pág. inventario 10 |
| ELEC-092 | — | — | Equipo: Bomba Flowserve 2 x 1 1/2 pulg; Accionamiento: Motor eléctrico 12 HP, 3500 RPM | Ambas fuentes; inventario ID 199; pág. eléctrica 3; pág. inventario 24 |
| ELEC-093 | — | — | Equipo: Bomba Flowserve 2 x 1 1/2 pulg; Accionamiento: Motor eléctrico 12 HP, 3500 RPM | Ambas fuentes; inventario ID 201; pág. eléctrica 3; pág. inventario 24 |
| ELEC-094 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 3; pág. inventario — |
| ELEC-095 | — | — | — | Ambas fuentes; inventario ID 236; pág. eléctrica 3; pág. inventario 26 |
| ELEC-096 | — | — | — | Ambas fuentes; inventario ID 230; pág. eléctrica 4; pág. inventario 26 |
| ELEC-097 | — | — | — | Ambas fuentes; inventario ID 229; pág. eléctrica 4; pág. inventario 26 |
| ELEC-098 | — | — | — | Ambas fuentes; inventario ID 229; pág. eléctrica 4; pág. inventario 26 |
| ELEC-099 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 4; pág. inventario — |
| ELEC-100 | — | — | — | Ambas fuentes; inventario ID 234; pág. eléctrica 4; pág. inventario 26 |
| ELEC-101 | — | — | — | Ambas fuentes; inventario ID 234; pág. eléctrica 4; pág. inventario 26 |
| ELEC-102 | — | — | — | Ambas fuentes; inventario ID 235; pág. eléctrica 4; pág. inventario 26 |
| ELEC-103 | — | — | — | Ambas fuentes; inventario ID 235; pág. eléctrica 4; pág. inventario 26 |
| ELEC-104 | Tamaño 3 x 2 | — | Equipo: Bomba centrífuga Warman, frame C, modelo AH, tamaño 3 x 2, serial 15445; proceso solución; impulsor y revestimiento de goma R55; sello por empaques y agua; rango 880 RPM; Accionamiento: Motor 7,5 HP, 1750 RPM, protección IP55 | Ambas fuentes; inventario ID 82; pág. eléctrica 4; pág. inventario 9 |
| ELEC-105 | Tamaño 3 x 2 | — | Equipo: Bomba centrífuga Warman, frame C, modelo AH, tamaño 3 x 2, serial 15445; proceso solución; impulsor y revestimiento de goma R55; sello por empaques y agua; rango 880 RPM; Accionamiento: Motor 7,5 HP, 1750 RPM, protección IP55 | Ambas fuentes; inventario ID 82; pág. eléctrica 4; pág. inventario 9 |
| ELEC-106 | — | 24/01/2025 | Equipo: Reductor Falk, ratio 24,95:1; Accionamiento: Motor eléctrico trifásico 3 HP, 1750 RPM | Ambas fuentes; inventario ID 80; pág. eléctrica 4; pág. inventario 9 |
| ELEC-107 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 4; pág. inventario — |
| ELEC-108 | — | — | Equipo: Bomba centrífuga, 60 a 160 L/min; altura 28 a 41 m; 220/440 V; 3400 RPM; 2,2 kW | Ambas fuentes; inventario ID 87; pág. eléctrica 4; pág. inventario 9 |
| ELEC-109 | — | — | Equipo: Bomba Flowserve 2 x 1 1/2 pulg; Accionamiento: Potencia 2,5 kW / 3 HP; 460 V; 1760 RPM; frame 213T | Ambas fuentes; inventario ID 88; pág. eléctrica 4; pág. inventario 9 |
| ELEC-110 | — | — | Equipo: Mixtec motor-reductor modelo 1000; kW rating 2,4; output speed 130 RPM; motor 1,5 kW; 460 V; frame DZ90L; montaje B5; eje 40 mm x 2100 mm; 3 aspas; peso 95 kg; torque 112 Nm | Ambas fuentes; inventario ID 86; pág. eléctrica 4; pág. inventario 9 |
| ELEC-111 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 4; pág. inventario — |
| ELEC-112 | — | — | Equipo: Bomba vertical 3 x 3; Accionamiento: Potencia 7,5 HP; 460 V; 1760 RPM; frame 254T | Ambas fuentes; inventario ID 90; pág. eléctrica 4; pág. inventario 9 |
| ELEC-113 | — | — | Equipo: Reductor: kW rating 5,7; output speed 72; eje diámetro 75 mm; 3 bolted blades | Ambas fuentes; inventario ID 77; pág. eléctrica 4; pág. inventario 8 |
| ELEC-114 | — | — | Equipo: Reductor: kW rating 5,7; output speed 72; eje diámetro 75 mm; 3 bolted blades | Ambas fuentes; inventario ID 77; pág. eléctrica 4; pág. inventario 8 |
| ELEC-115 | — | — | Equipo: Bomba de cavidad progresiva, potencia 2 HP, con reductor Mixtec | Ambas fuentes; inventario ID 78; pág. eléctrica 4; pág. inventario 8 |
| ELEC-116 | — | — | Equipo: Bomba de cavidad progresiva, potencia 2 HP, con reductor Mixtec | Ambas fuentes; inventario ID 78; pág. eléctrica 4; pág. inventario 8 |
| ELEC-117 | — | — | Equipo: Bomba centrífuga vertical de 5 HP, 3500 RPM, presión 300 psi; Accionamiento: Motor eléctrico 25 HP, 3500 RPM | Ambas fuentes; inventario ID 188; pág. eléctrica 4; pág. inventario 23 |
| ELEC-118 | — | 12/09/2015 | Equipo: Bomba centrífuga vertical de 5 HP, 3500 RPM, presión 300 psi; Accionamiento: Motor eléctrico 25 HP, 3500 RPM | Ambas fuentes; inventario ID 190; pág. eléctrica 4; pág. inventario 23 |
| ELEC-119 | 11 m de diámetro x 3,86 m de altura | — | Equipo: Capacidad 329 m3 | Ambas fuentes; inventario ID 217; pág. eléctrica 4; pág. inventario 25 |
| ELEC-120 | — | — | Equipo: Capacidad 14 m3 | Ambas fuentes; inventario ID 187; pág. eléctrica 4; pág. inventario 23 |
| ELEC-121 | Altura 1070 mm; ancho 857 mm; largo 1506 mm | — | Equipo: Bomba centrífuga Warman frame F, modelo AH, proceso lodo, 8 x 6; 1000 RPM máx.; potencia 115 HP/25 HP; cabeza 40 m; caudal 200 L/s; Accionamiento: Motor eléctrico 60 HP | Ambas fuentes; inventario ID 218; pág. eléctrica 5; pág. inventario 25 |
| ELEC-122 | Altura 1070 mm; ancho 857 mm; largo 1506 mm | — | Equipo: Bomba centrífuga Warman frame F, modelo AH, proceso lodo, 8 x 6; 1000 RPM máx.; potencia 115 HP/25 HP; cabeza 40 m; caudal 200 L/s; Accionamiento: Motor eléctrico 60 HP | Ambas fuentes; inventario ID 220; pág. eléctrica 5; pág. inventario 25 |
| ELEC-123 | 5 m de diámetro x 3 m de altura | — | Equipo: Capacidad 59 m3 | Ambas fuentes; inventario ID 212; pág. eléctrica 5; pág. inventario 25 |
| ELEC-124 | — | — | Equipo: KSB 80/5 WKL multietapa; descarga nominal 80 mm; 5 impulsores; presión máxima de succión 14 bar; caudal 100 m3/h; 1750 RPM; Accionamiento: Motor eléctrico 1750 RPM, 50 HP | Ambas fuentes; inventario ID 213; pág. eléctrica 5; pág. inventario 25 |
| ELEC-125 | — | — | Equipo: KSB 80/5 WKL multietapa; descarga nominal 80 mm; 5 impulsores; presión máxima de succión 14 bar; caudal 100 m3/h; 1750 RPM; Accionamiento: Motor eléctrico 1750 RPM, 50 HP | Ambas fuentes; inventario ID 215; pág. eléctrica 5; pág. inventario 25 |
| ELEC-126 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-127 | — | 2020 | Equipo: 3OMBA SUMERGIBLE TIPO LAPIZ, POTENCIA 2 HP VELOCIDAD 3500 RPM, ALTURA 100 MTS, CAUDAL 25 LITROS POR MINUTO A 50 MTS, DIAMETRO DE JESCARGA 1" DIAMETRO MAX CUERPO BOMBA 2" VOLTAJE 220 VOLTS | Ambas fuentes; inventario ID 226; pág. eléctrica 5; pág. inventario 26 |
| ELEC-128 | — | 2019 | Equipo: Comrpesor GA 315, potencia 350 HP y 60 Hz, Capacidad de alre FAD 20 a 85 M*H, Presión 5,5 - 7,5 3,5 - 10 y 14 BAR, Refrigeracion por alre y agua | Ambas fuentes; inventario ID 227; pág. eléctrica 5; pág. inventario 26 |
| ELEC-129 | — | jul-05 | Equipo: Compresor GA 30, Máx. Presión 10 BAR / 145 PSI Capacidad FAD 86,4 Us / 311,0 m3/min / 183,1 CFM Potencia del Motor 30 KW / 40 HP Nivel ruido70 db(A)Peso 567 Kg | Ambas fuentes; inventario ID 228; pág. eléctrica 5; pág. inventario 26 |
| ELEC-130 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-131 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-132 | — | 2018 | Equipo: Generador de 800 kVA | Ambas fuentes; inventario ID 203; pág. eléctrica 5; pág. inventario 24 |
| ELEC-133 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-134 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-135 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-136 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-137 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-138 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-139 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-140 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-141 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-142 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-143 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-144 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-145 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 5; pág. inventario — |
| ELEC-146 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 6; pág. inventario — |
| ELEC-147 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 6; pág. inventario — |
| ELEC-148 | — | — | — | Lista eléctrica; inventario ID —; pág. eléctrica 6; pág. inventario — |
| INV-001 | Longitud Y metros, Ancho 2 metros | abr-88 | Equipo: 4 Celdas Ceitron LCD-50K | Inventario técnico; inventario ID 1; pág. eléctrica —; pág. inventario 1 |
| INV-002 | 12.6 m3 | — | Equipo: 31.5 Ton | Inventario técnico; inventario ID 2; pág. eléctrica —; pág. inventario 1 |
| INV-004 | — | — | Equipo: motor eléctrico trifásico de 25 hp - 1750 rpm, 40 volts | Inventario técnico; inventario ID 4; pág. eléctrica —; pág. inventario 1 |
| INV-006 | — | ene-21 | Equipo: 125 hp, 1185 RPM, V 440/220, 60 HZ | Inventario técnico; inventario ID 6; pág. eléctrica —; pág. inventario 1 |
| INV-008 | — | ene-21 | Equipo: 50 Hp., Amp 38,2 - 19 1, Volts 230-450, 1750 RPM | Inventario técnico; inventario ID 8; pág. eléctrica —; pág. inventario 1 |
| INV-010 | — | — | Equipo: Modelo W21. HP: 115: Frame 404/5T ¿RPM 1175 | Inventario técnico; inventario ID 10; pág. eléctrica —; pág. inventario 1 |
| INV-012 | — | — | Equipo: Sin infor nación nación :30 hp,1720 Rpm, 460v,15 amp | Inventario técnico; inventario ID 12; pág. eléctrica —; pág. inventario 2 |
| INV-013 | — | — | Equipo: Sin infor nación 'Detector de metales Termo Ramse | Inventario técnico; inventario ID 13; pág. eléctrica —; pág. inventario 2 |
| INV-015 | — | — | Equipo: Sín infor nación N°: M3710T; Spec: 37G813T8601 nación '230/440; Amp: 21,2-19,8/9,8; RP! 50 Hz | Inventario técnico; inventario ID 15; pág. eléctrica —; pág. inventario 2 |
| INV-017 | — | — | Equipo: 77 9 infos nación k 9 hp,1725Rpm,440v,10 amp | Inventario técnico; inventario ID 17; pág. eléctrica —; pág. inventario 2 |
| INV-019 | — | — | Equipo: mación Sl info NETO ¡Hp: 15 ¡RPM:1750 ;Amp: 36, "Frecuencia: 60 Hz ¡Serial: P25G4 | Inventario técnico; inventario ID 19; pág. eléctrica —; pág. inventario 2 |
| INV-020 | 17,8 m3 | — | Equipo: nación dai 44,5 ton | Inventario técnico; inventario ID 20; pág. eléctrica —; pág. inventario 2 |
| INV-022 | — | Usado, 1999 | Equipo: PHILADELPHIA IN LINE REDUCER, size RFTB1Y; RPM 37; input RPM 1750; serial 24959R; HP rating 42,5 | Inventario técnico; inventario ID 22; pág. eléctrica —; pág. inventario 3 |
| INV-025 | — | — | Equipo: 12 HP; 1720 RPM; 460 V; 15 A | Inventario técnico; inventario ID 25; pág. eléctrica —; pág. inventario 3 |
| INV-027 | — | — | Equipo: 9 HP; 1725 RPM; 440 V; 10 A | Inventario técnico; inventario ID 27; pág. eléctrica —; pág. inventario 3 |
| INV-029 | — | — | Equipo: 10 HP; 1760 RPM; 460/230 V; 25/12,6 A; frame 216T | Inventario técnico; inventario ID 29; pág. eléctrica —; pág. inventario 3 |
| INV-030 | Altura 1420 mm x ancho 1020 mm x profundidad 450 mm | — | Equipo: Resguardo de componentes eléctricos | Inventario técnico; inventario ID 30; pág. eléctrica —; pág. inventario 3 |
| INV-031 | — | — | — | Inventario técnico; inventario ID 31; pág. eléctrica —; pág. inventario 3 |
| INV-032 | — | — | Equipo: Capacidad: 200 toneladas | Inventario técnico; inventario ID 32; pág. eléctrica —; pág. inventario 3 |
| INV-033 | Altura nación — 'Diámotr | Sin infor | Equipo: moy Mio capacidad: 300 Toneladas | Inventario técnico; inventario ID 33; pág. eléctrica —; pág. inventario 4 |
| INV-035 | mación gn info | Sin «info | Equipo: nación ¿Sin información | Inventario técnico; inventario ID 35; pág. eléctrica —; pág. inventario 4 |
| INV-036 | ción pe info | Sin ra N S info | Equipo: Cinta de 32" de ancho, 18 Roc nación «todillos de carga, 4 rodillos de re 'angulo de 30*, 1 rodillo de cola, 1 | Inventario técnico; inventario ID 36; pág. eléctrica —; pág. inventario 4 |
| INV-037 | Sin info mación | Sin "info | Equipo: Motor-reductor: Marca Dodge, 1 nación construcción G, tamaño 8, ratio 11 3, montaje A1, output 16,5 RPM | Inventario técnico; inventario ID 37; pág. eléctrica —; pág. inventario 4 |
| INV-039 | Sin info | 1199 | Equipo: Motor, marca WESTINGHOUSE E, HP: 1000, 60 Hz, serial 1581P212 exit volt 250, F.S 1,15 PH 3: e frame HR-6 | Inventario técnico; inventario ID 39; pág. eléctrica —; pág. inventario 4 |
| INV-041 | mación ¡Sin info | Sin "info | Equipo: mación ¿Motor principal 350 Hp, 460 VA! "FRAME D3IS55LX | Inventario técnico; inventario ID 41; pág. eléctrica —; pág. inventario 4 |
| INV-043 | — | — | Equipo: Motor principal 400 Hp, 460 VAC, 1190 RPM, 60 Hz FRAME DISS5LX | Inventario técnico; inventario ID 43; pág. eléctrica —; pág. inventario 5 |
| INV-045 | — | jul-22 | Equipo: Motor marca Industrial Electric, modelo V/WW/1EM100-18- 405T, 100 hp. 1750 rpm, protección IP55 | Inventario técnico; inventario ID 45; pág. eléctrica —; pág. inventario 5 |
| INV-046 | — | — | Equipo: Modelo: D20870/1312, voltex 114 mm, Apex 78 mm, leed 100 mn, presión de trabajo de 25 a 30 psi | Inventario técnico; inventario ID 46; pág. eléctrica —; pág. inventario 5 |
| INV-048 | — | sept-23 | Equipo: notor trfasico frame 405T, 115 hp. 1750 rpm, rotección IP55 | Inventario técnico; inventario ID 48; pág. eléctrica —; pág. inventario 5 |
| INV-049 | — | Sin | Equipo: Modelo: D20870/1312, voltex 114 mrn, Apex 78 mm, eed 100 mm, presión de trabajo de 25 a 30 psi | Inventario técnico; inventario ID 49; pág. eléctrica —; pág. inventario 5 |
| INV-051 | — | — | Equipo: Motor con características: potencia 5,5 kw, power 7,5 1p, voltaje 460, velocidad 1760 rpm, frame 2151 | Inventario técnico; inventario ID 51; pág. eléctrica —; pág. inventario 6 |
| INV-052 | — | mar-11 | Equipo: 3omba marca lincoln bomba marca Lincoln, modelo 1934, ratio 25:1, 200 PSI, airmotor 82737 | Inventario técnico; inventario ID 52; pág. eléctrica —; pág. inventario 6 |
| INV-053 | — | — | Equipo: 3omba de alta presión, 2000 PSI, motor de 5 HP, 230/460 Volt, 1170 RPM, 16,4/8,4 amp, frame 215 TC, 30 Hz | Inventario técnico; inventario ID 53; pág. eléctrica —; pág. inventario 6 |
| INV-054 | — | — | Equipo: Bomba de lubricación de baja caudal de 11.3 a 19 litros 'mincon una temperatura de 37 a 50 | Inventario técnico; inventario ID 54; pág. eléctrica —; pág. inventario 6 |
| INV-055 | — | mar-11 | Equipo: Bomba marca lincoln bomba marca Lincoln, modelo 1934, ratio 25:1, 200 PSI, airmotor 82737 | Inventario técnico; inventario ID 55; pág. eléctrica —; pág. inventario 6 |
| INV-056 | — | mar-11 | Equipo: Bomba marca lincoln bomba marca Lincoln, modelo 1934, ratio 25:1, 200 PSI, airmotor 82737 | Inventario técnico; inventario ID 56; pág. eléctrica —; pág. inventario 6 |
| INV-057 | — | — | — | Inventario técnico; inventario ID 57; pág. eléctrica —; pág. inventario 6 |
| INV-058 | — | — | — | Inventario técnico; inventario ID 58; pág. eléctrica —; pág. inventario 6 |
| INV-059 | — | — | Equipo: Balanza de dinámica marca:thermo ramsey, modelo: 1C 20-1 | Inventario técnico; inventario ID 59; pág. eléctrica —; pág. inventario 6 |
| INV-060 | 5 mts de Diámetro, 5.5 mts de altura | abr-88 | Equipo: Capacidad Volumen: 103 m3, Nivel máximo 5250 mm Nivel mínimo 3500 mm | Inventario técnico; inventario ID 60; pág. eléctrica —; pág. inventario 6 |
| INV-062 | 5 mts de Diámetro, 5.5 mts de altura | abr-88 | Equipo: Capacidad Volumen: 103 m3, Nivel máximo 5250 mm Nivel mínimo 3500 mm | Inventario técnico; inventario ID 62; pág. eléctrica —; pág. inventario 6 |
| INV-065 | — | — | Equipo: Motor: marca EBERLE, modelo 200 M4/Y1, seri :3637060, 30 Kw, 40 Hp, 1770 RPM, voltaje 201 :230/460, amperaje 101,7/46 | Inventario técnico; inventario ID 65; pág. eléctrica —; pág. inventario 7 |
| INV-068 | — | abr-88 | Equipo: 14 motores nidraulicos, marca stafía, model 'HM/B200/P 1/S504/30, serial 16890, torque máximo 539 'NM, 3.4 RPM max, eficiencia 85%, presión de la alarm 13,07 Mpa, ajuste de la válvula de alivio 14,2 Mpa presión de arranque 1,07 Mpa. Sistema hidráulico. bomba marca sundstrand pume | Inventario técnico; inventario ID 68; pág. eléctrica —; pág. inventario 7 |
| INV-071 | — | — | Equipo: Potencia 11 kW / 15 HP; 460 V; 1760 RPM; frame 215T | Inventario técnico; inventario ID 71; pág. eléctrica —; pág. inventario 8 |
| INV-072 | Diámetro 8,1 m; área 28,27 m2; altura de lado recto 2 m | abr-88 | — | Inventario técnico; inventario ID 72; pág. eléctrica —; pág. inventario 8 |
| INV-073 | — | — | Equipo: Reductor: kW rating 5,7; output speed 72; eje diámetro 75 mm; 3 bolted blades | Inventario técnico; inventario ID 73; pág. eléctrica —; pág. inventario 8 |
| INV-074 | — | — | — | Inventario técnico; inventario ID 74; pág. eléctrica —; pág. inventario 8 |
| INV-075 | Diámetro 3 m; altura 3 m | abr-88 | Equipo: Volumen 19,5 m3 | Inventario técnico; inventario ID 75; pág. eléctrica —; pág. inventario 8 |
| INV-076 | Diámetro 3 m; altura 3 m | abr-88 | Equipo: Volumen 19,5 m3 | Inventario técnico; inventario ID 76; pág. eléctrica —; pág. inventario 8 |
| INV-079 | Diámetro 2,68 m; altura 2,5 m | — | Equipo: Volumen 14 m3 | Inventario técnico; inventario ID 79; pág. eléctrica —; pág. inventario 8 |
| INV-081 | — | 24/01/2025 | Equipo: Motor eléctrico trifásico 3 HP, 1750 RPM | Inventario técnico; inventario ID 81; pág. eléctrica —; pág. inventario 9 |
| INV-083 | — | — | Equipo: Motor 7,5 HP, 1750 RPM, protección IP55 | Inventario técnico; inventario ID 83; pág. eléctrica —; pág. inventario 9 |
| INV-084 | Volumen 14 m3; nivel máx. 2830 mm; diámetro 2500 mm; elevación 3180 mm | — | — | Inventario técnico; inventario ID 84; pág. eléctrica —; pág. inventario 9 |
| INV-085 | Volumen 5,5 m3; nivel máx. 1750 mm; diámetro 2000 mm; elevación 2000 mm | 1988 | — | Inventario técnico; inventario ID 85; pág. eléctrica —; pág. inventario 9 |
| INV-089 | — | — | Equipo: Potencia 2,5 kW / 3 HP; 460 V; 1760 RPM; frame 213T | Inventario técnico; inventario ID 89; pág. eléctrica —; pág. inventario 9 |
| INV-091 | — | — | Equipo: Potencia 7,5 HP; 460 V; 1760 RPM; frame 254T | Inventario técnico; inventario ID 91; pág. eléctrica —; pág. inventario 9 |
| INV-092 | — | — | — | Inventario técnico; inventario ID 92; pág. eléctrica —; pág. inventario 9 |
| INV-095 | — | — | Equipo: EBERLE 9,4 kW, 12,5 HP, 1760 RPM, 60 Hz, 230/460 V, 29,4/14,6 A | Inventario técnico; inventario ID 95; pág. eléctrica —; pág. inventario 10 |
| INV-096 | Tamaño 6 x 4 | may-22 | Equipo: Bomba Flowserve 6 x 4, caudal 200 m3; Accionamiento: Motor eléctrico trifásico 15 HP, 1750 RPM, 440 V | Inventario técnico; inventario ID 96; pág. eléctrica —; pág. inventario 10 |
| INV-097 | — | may-22 | Equipo: Motor eléctrico trifásico 15 HP, 1750 RPM, 440 V | Inventario técnico; inventario ID 97; pág. eléctrica —; pág. inventario 10 |
| INV-098 | Tamaño 6 x 4 | may-22 | Equipo: Bomba Flowserve 6 x 4, caudal 200 m3; Accionamiento: Motor eléctrico trifásico 15 HP, 1750 RPM, 440 V | Inventario técnico; inventario ID 98; pág. eléctrica —; pág. inventario 10 |
| INV-099 | — | may-22 | Equipo: Motor eléctrico trifásico 15 HP, 1750 RPM, 440 V | Inventario técnico; inventario ID 99; pág. eléctrica —; pág. inventario 10 |
| INV-100 | Tamaño 3 x 3 | abr-23 | Equipo: Bomba Warman horizontal centrífuga 3 x 3, impulsor A-05 sin revestimiento; caudal 40-80 L/s; altura 40-50 m; para solución ácida y sólidos en suspensión de 1-4 mm; impulsor abierto de acero inoxidable; Accionamiento: otor eléctrico trifásico de 12 HP -1750 RPM, 440 Volts | Inventario técnico; inventario ID 100; pág. eléctrica —; pág. inventario 10 |
| INV-101 | in información "1 | br-23 | Equipo: otor eléctrico trifásico de 12 HP -1750 RPM, 440 Volts | Inventario técnico; inventario ID 101; pág. eléctrica —; pág. inventario 11 |
| INV-109 | in información - : » 4 | in . formación A | Equipo: Bomba de transferencia de Carbón vertical: Marca: WVEDALA SALA PUMP, modelo STGVA 150-33WEFR: IS/H! CHROME, velocidad de la bomba 823 RPM,: audal 600 Its/min, revestida en goma. Motor: 5 Hp se implanta mejora con motor de 7,5 HP, elocidad 1750 RPM, voltaje 230/460, frecuencia 60 Hz, ame 184T, peso 100 lbs; Accionamiento: otor eléctrico de 12 hp a 1750 rpm, 440 volts, : "Y | Inventario técnico; inventario ID 109; pág. eléctrica —; pág. inventario 12 |
| INV-110 | in información y | in y formación | Equipo: otor eléctrico de 12 hp a 1750 rpm, 440 volts, : "Y | Inventario técnico; inventario ID 110; pág. eléctrica —; pág. inventario 12 |
| INV-111 | — | — | Equipo: Bomba china vertical Revestimiento Caucho natura impulsor revestido en caucho natural, Caudal (q) litros segundo (l/s) ; metros cúbicos! hora (m3/h) 100 m3/h Altura 12,2, mts, N° de serie: 2002-793-80-3, Velocida: del impulsor 1071 RPM, Soporte para motor. Protecto de poleas y correas; Accionamiento: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 111; pág. eléctrica —; pág. inventario 13 |
| INV-112 | — | — | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 112; pág. eléctrica —; pág. inventario 13 |
| INV-113 | — | — | Equipo: 3omba china vertical Revestimiento Caucho natural, mpulsor revestido en caucho natural, Caudal (q) litros / segundo (l/s) ; metros cúbicos/ hora (m3/h) 100 m3/h, Miura 12,2, mts, N° de serle: 2002-793-80-3, Velocidad lol impulsor 1071 RPM, Soporte para motor, Protector le poleas y correas; Accionamiento: notor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 113; pág. eléctrica —; pág. inventario 13 |
| INV-114 | — | Sin V nformación | Equipo: notor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 114; pág. eléctrica —; pág. inventario 13 |
| INV-116 | x in información | in ' wMormación | Equipo: Motor marca EMERSON, 50 hp. 1750 RPM, 284T: ramo, 230/460 Volt, 56/28 amp | Inventario técnico; inventario ID 116; pág. eléctrica —; pág. inventario 13 |
| INV-118 | E ' In información . 1] | in , formación | Equipo: totor eléctrico trifanico de 00 Hp - 1750 rpm | Inventario técnico; inventario ID 118; pág. eléctrica —; pág. inventario 13 |
| INV-120 | 1 a Información 'm 4 | n y formación ¡9 | Equipo: tor eléctrico de 7,5 hp a 1750 rpm, 440 volts, "wo | Inventario técnico; inventario ID 120; pág. eléctrica —; pág. inventario 14 |
| INV-121 | 1 Información ¡Si | n ' formación ¡S | Equipo: Información ¿Sin | Inventario técnico; inventario ID 121; pág. eléctrica —; pág. inventario 14 |
| INV-122 | olumen 112 m* ' livel máximo 8059; n Dímetro 4200:M: n Elevación 8400:1 1 n | A a sm 1-88 y sI im | Equipo: la Kambalda diámetro: malla de acero inoxidable dele m de espesor, 0,8 mm de abertura | Inventario técnico; inventario ID 122; pág. eléctrica —; pág. inventario 14 |
| INV-123 | dumen 112 m* ' vel máximo 8059; n Dímetro 4200:M: n Elevación 8400:1 1 4] | Y yl 1-88 sa «Mm ¿m | Equipo: la Kambalda diámetro: malla de acero inoxidable dle m de espesor, 0,8 mm de abertura | Inventario técnico; inventario ID 123; pág. eléctrica —; pág. inventario 14 |
| INV-124 | lumen 112 m* , ivel máximo 8059:pyp ' AN metro 4200 mm | Y sob :D | Equipo: a Kambalda diámetro: malla de acero inoxidable dote m de espesor, 0,8 mm de abertura | Inventario técnico; inventario ID 124; pág. eléctrica —; pág. inventario 14 |
| INV-125 | lumen 112m" + vel máximo 805910 ' Dímetro 4200;, A ¡ Elevación 8400 | Y so -88 ¿mi mi ¿MI | Equipo: a Kambalda diámetro: malla de acero inoxidable dle n de espesor, 0,8 mm de abertura | Inventario técnico; inventario ID 125; pág. eléctrica —; pág. inventario 14 |
| INV-126 | lumen 112m" : vel máximo 8059), - Dimetro 4200. pa Elevación 8400 | Vi -88 ¿mr "mn ¿mn | Equipo: y Kambalda diámetro: malla de acero inoxidable oa n de espesor, 0,8 mm de abertura | Inventario técnico; inventario ID 126; pág. eléctrica —; pág. inventario 14 |
| INV-127 | Volumen 112 m3; nivel máximo 8059 mm; diámetro 4200 mm; elevación 8400 mm | abr-88 | Equipo: Malla Kambalda de acero inoxidable, 1 mm de espesor y 0,8 mm de abertura | Inventario técnico; inventario ID 127; pág. eléctrica —; pág. inventario 15 |
| INV-128 | Volumen 112 m3; nivel máximo 8059 mm; diámetro 4200 mm; elevación 8400 mm | abr-88 | Equipo: Malla Kambalda de acero inoxidable, 1 mm de espesor y 0,8 mm de abertura | Inventario técnico; inventario ID 128; pág. eléctrica —; pág. inventario 15 |
| INV-129 | Volumen 112 m3; nivel máximo 8059 mm; diámetro 4200 mm; elevación 8400 mm | abr-88 | Equipo: Malla Kambalda de acero inoxidable, 1 mm de espesor y 0,8 mm de abertura | Inventario técnico; inventario ID 129; pág. eléctrica —; pág. inventario 15 |
| INV-130 | Volumen 112 m3; nivel máximo 8059 mm; diámetro 4200 mm; elevación 8400 mm | abr-88 | Equipo: Malla Kambalda de acero inoxidable, 1 mm de espesor y 0,8 mm de abertura | Inventario técnico; inventario ID 130; pág. eléctrica —; pág. inventario 15 |
| INV-142 | — | — | Equipo: Motor eléctrico 5 HP, 1750 RPM, 440 V | Inventario técnico; inventario ID 142; pág. eléctrica —; pág. inventario 18 |
| INV-144 | — | — | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 144; pág. eléctrica —; pág. inventario 19 |
| INV-146 | — | — | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 146; pág. eléctrica —; pág. inventario 19 |
| INV-148 | — | — | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 148; pág. eléctrica —; pág. inventario 19 |
| INV-150 | 3in información | — | Equipo: notor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 150; pág. eléctrica —; pág. inventario 19 |
| INV-152 | in información | Mormación | Equipo: notor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 152; pág. eléctrica —; pág. inventario 19 |
| INV-154 | — | — | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 154; pág. eléctrica —; pág. inventario 20 |
| INV-156 | — | — | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 156; pág. eléctrica —; pág. inventario 20 |
| INV-158 | — | Sin | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 158; pág. eléctrica —; pág. inventario 20 |
| INV-160 | — | — | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 160; pág. eléctrica —; pág. inventario 20 |
| INV-162 | — | — | Equipo: Motor eléctrico 12 HP, 1750 RPM, 440 V | Inventario técnico; inventario ID 162; pág. eléctrica —; pág. inventario 21 |
| INV-166 | — | — | Equipo: Motor eléctrico trifásico 200 HP, 3500 RPM, 440 V | Inventario técnico; inventario ID 166; pág. eléctrica —; pág. inventario 21 |
| INV-168 | — | — | Equipo: Motor eléctrico trifásico 200 HP, 3500 RPM, 440 V | Inventario técnico; inventario ID 168; pág. eléctrica —; pág. inventario 21 |
| INV-169 | 5100 x 1200 mm | — | Equipo: Bomba vertical Svedala Sala Pump modelo STGVA 150-33WFR, caudal 600 L/min; motor inicialmente 5 HP, mejora a 7,5 HP, 1750 RPM, 230/460 V, 60 Hz, frame 184T; Accionamiento: Motor eléctrico 12 HP, 1750 RPM, 440 V | Inventario técnico; inventario ID 169; pág. eléctrica —; pág. inventario 21 |
| INV-170 | — | — | Equipo: Motor eléctrico 12 HP, 1750 RPM, 440 V | Inventario técnico; inventario ID 170; pág. eléctrica —; pág. inventario 21 |
| INV-174 | — | — | Equipo: motor eléctrico de 5 hp a 1750 rpm, 440 volts | Inventario técnico; inventario ID 174; pág. eléctrica —; pág. inventario 22 |
| INV-177 | — | — | Equipo: Tipo M10-MFG serie 30100-76951, 7 placas de acero, para enfriamiento de solución. Entrada celda | Inventario técnico; inventario ID 177; pág. eléctrica —; pág. inventario 22 |
| INV-181 | — | — | Equipo: EBERLE 9,4 kW, 12,5 HP, 1760 RPM, 60 Hz, 230/460 V, 29,4/14,6 A | Inventario técnico; inventario ID 181; pág. eléctrica —; pág. inventario 23 |
| INV-183 | — | — | Equipo: Motor 5 HP, 1750 RPM | Inventario técnico; inventario ID 183; pág. eléctrica —; pág. inventario 23 |
| INV-186 | — | 2022 | Equipo: Caldera china de 100 HP - 4.000.000 BTU | Inventario técnico; inventario ID 186; pág. eléctrica —; pág. inventario 23 |
| INV-189 | — | — | Equipo: Motor eléctrico 25 HP, 3500 RPM | Inventario técnico; inventario ID 189; pág. eléctrica —; pág. inventario 23 |
| INV-191 | — | — | Equipo: Motor eléctrico 25 HP, 3500 RPM | Inventario técnico; inventario ID 191; pág. eléctrica —; pág. inventario 23 |
| INV-192 | — | — | — | Inventario técnico; inventario ID 192; pág. eléctrica —; pág. inventario 23 |
| INV-193 | — | — | Equipo: Bomba centrífuga vertical multietapa, 300 psi, 3500 RPM | Inventario técnico; inventario ID 193; pág. eléctrica —; pág. inventario 23 |
| INV-194 | 5100 x 1200 mm | — | Equipo: Bomba Galingher modelo 50-MR2, tipo vertical; caudal 9,8 L/s (35,3 m3/h); impulsor y revestimiento de neopropano; 1560 RPM; polea conductora 6,5 x 4-34; polea inducida 10,6 x 4-3V; Accionamiento: Motor eléctrico trifásico 5 HP, 1750 RPM | Inventario técnico; inventario ID 194; pág. eléctrica —; pág. inventario 24 |
| INV-195 | — | — | Equipo: Motor eléctrico trifásico 5 HP, 1750 RPM | Inventario técnico; inventario ID 195; pág. eléctrica —; pág. inventario 24 |
| INV-196 | Diámetro 3000 mm x altura 3500 mm | — | Equipo: Capacidad 22 m3 | Inventario técnico; inventario ID 196; pág. eléctrica —; pág. inventario 24 |
| INV-197 | Diámetro 3000 mm x altura 3500 mm | — | Equipo: Capacidad 22 m3 | Inventario técnico; inventario ID 197; pág. eléctrica —; pág. inventario 24 |
| INV-198 | — | — | Equipo: Motor-reductor, entrada 1750 RPM, salida 72 RPM, motor 0,75 kW | Inventario técnico; inventario ID 198; pág. eléctrica —; pág. inventario 24 |
| INV-200 | — | — | Equipo: Motor eléctrico 12 HP, 3500 RPM | Inventario técnico; inventario ID 200; pág. eléctrica —; pág. inventario 24 |
| INV-202 | — | — | Equipo: Motor eléctrico 12 HP, 3500 RPM | Inventario técnico; inventario ID 202; pág. eléctrica —; pág. inventario 24 |
| INV-204 | — | 2021 | Equipo: Generador de 1000 kVA | Inventario técnico; inventario ID 204; pág. eléctrica —; pág. inventario 24 |
| INV-205 | 1,2 m x 5 m de altura | — | Equipo: Capacidad 2 t | Inventario técnico; inventario ID 205; pág. eléctrica —; pág. inventario 24 |
| INV-206 | 2150 x 1900 x 3500 mm | — | Equipo: 12,9 m3 | Inventario técnico; inventario ID 206; pág. eléctrica —; pág. inventario 24 |
| INV-207 | Tamaño 3 x 2 | 2019 | Equipo: Bomba Warman C-AH 3 x 2, serial 15445, frame C; impulsor y revestimiento R55; sello por empaques y agua; 880 RPM; Accionamiento: Motor 5 HP, 1750 RPM, protección IP55 | Inventario técnico; inventario ID 207; pág. eléctrica —; pág. inventario 24 |
| INV-208 | — | — | Equipo: Motor 5 HP, 1750 RPM, protección IP55 | Inventario técnico; inventario ID 208; pág. eléctrica —; pág. inventario 24 |
| INV-210 | — | 2021 | Equipo: Motor eléctrico trifásico 3 HP, 3500 RPM | Inventario técnico; inventario ID 210; pág. eléctrica —; pág. inventario 25 |
| INV-211 | 2250 x 2800 mm | — | Equipo: Capacidad 8,8 m3 | Inventario técnico; inventario ID 211; pág. eléctrica —; pág. inventario 25 |
| INV-214 | — | — | Equipo: Motor eléctrico 1750 RPM, 50 HP | Inventario técnico; inventario ID 214; pág. eléctrica —; pág. inventario 25 |
| INV-216 | — | — | Equipo: Motor eléctrico 1750 RPM, 50 HP | Inventario técnico; inventario ID 216; pág. eléctrica —; pág. inventario 25 |
| INV-219 | — | — | Equipo: Motor eléctrico 60 HP | Inventario técnico; inventario ID 219; pág. eléctrica —; pág. inventario 25 |
| INV-221 | — | — | Equipo: Motor eléctrico 60 HP | Inventario técnico; inventario ID 221; pág. eléctrica —; pág. inventario 25 |
| INV-222 | — | 2020 | Equipo: Estructura de 4 m x 4 m | Inventario técnico; inventario ID 222; pág. eléctrica —; pág. inventario 25 |
| INV-223 | 3in información | 2020 | Equipo: 30mba cnina venicaí Revestimiento Gaucho natural mpulsor revestido en caucho natural, Caudal (q) lítros segundo (l/s) ; metros cubicos/ hora (m3/h) 100 m3/h Mura 12,2, mts, N° de serie: 2002-793-80-3, Velocidad tal lnumtiadsr 1071 ROM Canara nará matar Derntartar | Inventario técnico; inventario ID 223; pág. eléctrica —; pág. inventario 26 |
| INV-224 | 3in información | 2021 | Equipo: Motor eléctrico trifásico de 25 HP -1750 rpm 440 volts | Inventario técnico; inventario ID 224; pág. eléctrica —; pág. inventario 26 |
| INV-225 | — | — | Equipo: capacidad 20 m3 | Inventario técnico; inventario ID 225; pág. eléctrica —; pág. inventario 26 |
| INV-231 | — | — | — | Inventario técnico; inventario ID 231; pág. eléctrica —; pág. inventario 26 |
| INV-232 | — | — | — | Inventario técnico; inventario ID 232; pág. eléctrica —; pág. inventario 26 |
| INV-233 | — | — | — | Inventario técnico; inventario ID 233; pág. eléctrica —; pág. inventario 26 |
| INV-237 | — | — | — | Inventario técnico; inventario ID 237; pág. eléctrica —; pág. inventario 26 |

## 6. Control de inconsistencias y validación pendiente
### 6.1 Registros con alertas expresas
**192 registros** tienen alguna mención de revisión, OCR, inconsistencia o ambigüedad en campos de control (criterio textual amplio; no implica 192 defectos confirmados).
| ID | Código | Equipo | Evaluación eléctrica | Observaciones / revisión |
|---|---|---|---|---|
| ELEC-001 | A-120 | Alimentador de placas | Consistente | Revisar detalles OCR |
| ELEC-002 | A-135 | Triturador primario | Consistente | Revisar detalles OCR |
| ELEC-003 | A-145 | Cinta transportadora N.º 1 | Consistente | Revisar detalles OCR |
| ELEC-004 | A-160 | Criba vibradora | Consistente | Revisar detalles OCR |
| ELEC-005 | A-170 | Triturador de cono | Consistente | Revisar detalles OCR |
| ELEC-007 | A-175 | Cinta transportadora N.º 2 | Consistente | Revisar detalles OCR |
| ELEC-008 | A-180 | Cinta transportadora N.º 3 | Consistente | Revisar detalles OCR |
| ELEC-010 | A-200 | Muestreador | Revisar: kVA anotado difiere >15%; Fuente revisar | kVA manuscrito de baja claridad. |
| ELEC-012 | A-310 | Triturador primario L2 | Fuente manuscrito | Potencia y corriente manuscritas. |
| ELEC-015 | A-340 | Triturador de cono L2 | Revisar: kW > kVA calculado | — |
| ELEC-016 | A-350 | Cinta transportadora N.º 6 L2 | Revisar: kVA anotado difiere >15% | Verificado visualmente |
| ELEC-017 | A-360 | Cinta transportadora N.º 7 L2 | Fuente manuscrito | Potencia sobrescrita; se lee 9 kW.; Verificado visualmente |
| ELEC-018 | — | Cinta transportadora L13 | Fuente manuscrito | Equipo agregado a mano, sin código visible.; Revisar detalles OCR |
| ELEC-019 | C-145/1 | Molino de bolas secundario M1 | Revisar: kW > kVA calculado; Fuente revisar | Potencia y corriente con correcciones manuscritas.; Revisar detalles OCR |
| ELEC-020 | C-145/2 | Movimiento lento M1 | Consistente | Revisar detalles OCR |
| ELEC-021 | C-155/A | Bomba de hidrociclón N.º 1 | Consistente | Revisar detalles OCR |
| ELEC-022 | C-155/B | Bomba de hidrociclón N.º 2 | Consistente | Revisar detalles OCR |
| ELEC-023 | C-200/1 | Molino de bolas secundario M2 | Revisar: kW > kVA calculado | Revisar detalles OCR |
| ELEC-024 | C-200/2 | Movimiento lento M2 | Consistente | Revisar detalles OCR |
| ELEC-025 | C-290 | Bomba de sumidero M1/M2 | Revisar: kVA anotado difiere >15% | Revisar detalles OCR |
| ELEC-027 | C-320 | Cinta transportadora N.º 10 | Consistente | Revisar detalles OCR |
| ELEC-028 | C-340 | Molino de bolas primario | Revisar: kVA anotado difiere >15%; Fuente revisar | Potencia manuscrita se lee 746 kW; kVA anotado se lee 95. Valores requieren confirmación.; Revisar detalles OCR |
| ELEC-029 | C-350 | Bomba de sumidero M3 | Consistente | Revisar detalles OCR |
| ELEC-030 | C-370/1 | Agitador prelix | Fuente manuscrito | Dos filas independientes (C-370/1 y C-380/1); se mantiene una fila por código en el listado.; Revisar detalles OCR |
| ELEC-031 | C-380/1 | Agitador prelix | Fuente manuscrito | Valor manuscrito.; Revisar detalles OCR |
| ELEC-032 | C-390 | Bomba de transferencia de pre-lix | Fuente manuscrito | Valor manuscrito.; Revisar detalles OCR |
| ELEC-033 | D-100 | Malla lineal | Consistente | Revisar detalles OCR |
| ELEC-034 | D-105 | Criba de rechazo | Consistente | Revisar detalles OCR |
| ELEC-035 | D-110 | Espesador | Revisar: kW > kVA calculado | Revisar detalles OCR |
| ELEC-036 | D-115 | Bomba de transferencia 1 | Revisar: kW > kVA calculado | Revisar detalles OCR |
| ELEC-037 | D-120 | Bomba de transferencia 2 | Revisar: kW > kVA calculado | Revisar detalles OCR |
| ELEC-038 | D-130 | Bomba de sumidero | Revisar: kW > kVA calculado | Verificado visualmente |
| ELEC-039 | D-175 | Clarificador | Fuente manuscrito | Voltaje, potencia y corriente corregidos a mano. |
| ELEC-040 | E-310 | Tanque LIX 1 / transferencia | Fuente revisar | Valores reconstruidos por patrón; la primera fila está fuertemente sobrescrita.; Revisar detalles OCR |
| ELEC-041 | E-310/1 | Agitador LIX 1 | Fuente revisar | kVA alineado por patrón repetitivo del bloque. |
| ELEC-042 | E-320 | Tanque LIX 2 / transferencia | Fuente manuscrito | Revisar detalles OCR |
| ELEC-043 | E-320/1 | Agitador LIX 2 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-044 | E-330 | Tanque LIX 3 / transferencia | Fuente manuscrito | Revisar detalles OCR |
| ELEC-045 | E-330/1 | Agitador LIX 3 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-046 | E-370 | Tanque LIX 4 / transferencia | Fuente manuscrito | Revisar detalles OCR |
| ELEC-047 | E-370/1 | Agitador LIX 4 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-048 | E-340 | Bomba transf. A | Revisar: kW > kVA calculado; Fuente manuscrito | Corriente corregida a mano.; Revisar detalles OCR |
| ELEC-049 | E-350 | Bomba transf. B | Revisar: kW > kVA calculado; Fuente manuscrito | Potencia y corriente corregidas a mano.; Revisar detalles OCR |
| ELEC-050 | E-360 | Bomba de sumidero | Revisar: kVA anotado difiere >15% | Revisar detalles OCR |
| ELEC-051 | E-110/1 | Agitador CIP 1 | Fuente manuscrito | Verificado visualmente |
| ELEC-052 | E-120/1 | Agitador CIP 2 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-053 | E-130/1 | Agitador CIP 3 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-054 | E-140/1 | Agitador CIP 4 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-055 | E-150/1 | Agitador CIP 5 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-056 | E-160/1 | Agitador CIP 6 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-057 | E-170/1 | Agitador CIP 7 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-058 | E-180/1 | Agitador CIP 8 | Fuente manuscrito | Verificado visualmente |
| ELEC-059 | E-190/1 | Agitador CIP 9 | Fuente manuscrito | Verificado visualmente |
| ELEC-060 | E-200/1 | Agitador CIP 10 | Fuente manuscrito | Verificado visualmente |
| ELEC-062 | E-220 | Bomba de transferencia 2 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-063 | E-230 | Bomba de transferencia 3 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-064 | E-240 | Bomba de transferencia 4 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-065 | E-250 | Bomba de transferencia 5 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-066 | E-260 | Bomba de transferencia 6 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-067 | E-270 | Bomba de transferencia 7 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-068 | E-280 | Bomba de transferencia 8 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-069 | E-290 | Bomba de transferencia 9 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-070 | E-300 | Bomba de transferencia 10 | Fuente manuscrito | Revisar detalles OCR |
| ELEC-071 | E-380 | Bomba de sumidero | Fuente manuscrito | Revisar detalles OCR |
| ELEC-072 | E-400 | Criba de cola | Fuente manuscrito | Verificado visualmente |
| ELEC-073 | E-420 | Sumidero de cola | Fuente manuscrito | Verificado visualmente |
| ELEC-074 | E-430 | Bomba de cola 1 | Fuente manuscrito | Verificado visualmente |
| ELEC-075 | E-440 | Bomba de cola 2 | Fuente manuscrito | Verificado visualmente |
| ELEC-077 | G-100/A | Criba de carbón cargado | Consistente | Revisar detalles OCR |
| ELEC-078 | G-100/B | Criba de carbón eluido | Consistente | Revisar detalles OCR |
| ELEC-079 | G-135 | Intercambiador I | Faltan voltaje/corriente; Falta potencia; Falta kVA anotado | Sin valores eléctricos en el documento.; Revisar detalles OCR |
| ELEC-080 | G-180 | Criba de lavado de carbón regenerado | Consistente | Revisar detalles OCR |
| ELEC-081 | G-150 | Columna de elución | Consistente | Revisar detalles OCR |
| ELEC-082 | G-160 | Horno de regeneración | Revisar: kW > kVA calculado | Revisar detalles OCR |
| ELEC-083 | G-165 | Bomba de transferencia de carbón regenerado | Revisar: kVA anotado difiere >15% | Verificado visualmente |
| ELEC-084 | G-195 | Bomba de sumidero de elución | Consistente | Revisar detalles OCR |
| ELEC-085 | G-210 | Caldera | Revisar: kVA anotado difiere >15%; Fuente manuscrito | Voltaje corregido a mano sobre 440 V.; Verificado visualmente |
| ELEC-086 | G-210/1 | Caldera | Revisar: kW > kVA calculado; Fuente revisar | Voltaje manuscrito parece 220/222 V; corriente se lee 20 A.; Verificado visualmente |
| ELEC-087 | G-225 | Bomba de sumidero de carbón regenerado | Revisar: kVA anotado difiere >15% | Verificado visualmente |
| ELEC-089 | G-275 | Intercambiador II | Revisar: kW > kVA calculado | Revisar detalles OCR |
| ELEC-095 | H-220 | Extractor de aire de fundición | Consistente | Revisar detalles OCR |
| ELEC-096 | H-150 | Horno de calcinación | Faltan voltaje/corriente; Falta potencia; Falta kVA anotado | Revisar detalles OCR |
| ELEC-097 | H-160 | Horno de fundición eléctrico | Faltan voltaje/corriente; Falta potencia; Falta kVA anotado | Revisar detalles OCR |
| ELEC-098 | H-170 | Horno de fundición a gasoil | Faltan voltaje/corriente; Falta potencia; Falta kVA anotado | Revisar detalles OCR |
| ELEC-100 | H-300 | Celda electrolítica | Consistente | Revisar detalles OCR |
| ELEC-101 | H-300-1 | Celda electrolítica | Consistente | Revisar detalles OCR |
| ELEC-102 | H-310 | Rectificador 1 | Consistente | Revisar detalles OCR |
| ELEC-103 | H-315 | Rectificador 2 | Consistente | Revisar detalles OCR |
| ELEC-104 | R-050/A | Bomba transfcal #1 | Revisar: kVA anotado difiere >15% | Verificado visualmente |
| ELEC-105 | R-050/B | Bomba transf. cal #2 | Revisar: kVA anotado difiere >15% | Verificado visualmente |
| ELEC-106 | R-055/1 | Agitador #1 | Revisar: kVA anotado difiere >15% | Verificado visualmente |
| ELEC-107 | R-065/1 | Agitador #2 | Revisar: kVA anotado difiere >15% | — |
| ELEC-108 | R-220 | Bomba de transferencia #1 | Revisar: kVA anotado difiere >15%; Fuente manuscrito | Voltaje y corriente corregidos a mano.; Verificado visualmente |
| ELEC-110 | R-200/A | Agitador 1 | Revisar: kVA anotado difiere >15%; Fuente manuscrito | Verificado visualmente |
| ELEC-113 | D-195/1 | Agitador 1 | Fuente manuscrito | Verificado visualmente |
| ELEC-114 | D-205/1 | Agitador 2 | Fuente manuscrito | Verificado visualmente |
| ELEC-115 | D-200 | Bomba floculante #1 | Revisar: kVA anotado difiere >15%; Fuente manuscrito | Verificado visualmente |
| ELEC-116 | D-210 | Bomba floculante #2 | Revisar: kVA anotado difiere >15%; Fuente manuscrito | Verificado visualmente |
| ELEC-121 | S-140 | Bomba de agua del circuito de molinos 1 | Fuente manuscrito | Verificado visualmente |
| ELEC-122 | S-150 | Bomba de agua del circuito de molinos 2 | Fuente manuscrito | Verificado visualmente |
| ELEC-124 | S-220 | Bomba de agua de alta presión 1 | Fuente manuscrito | Verificado visualmente |
| ELEC-125 | S-225 | Bomba de agua de alta presión 2 | Fuente manuscrito | Verificado visualmente |
| ELEC-126 | S-230 | Bomba para agua de sellos 1 | Faltan voltaje/corriente; Falta potencia; Fuente revisar | El valor 31,2 kVA aparece alineado con esta zona; confirmar asignación. |
| ELEC-127 | — | Bomba de pozo profundo | Falta kVA anotado; Fuente manuscrito | Equipo agregado a mano, sin código. kVA no claramente asignado.; Revisar detalles OCR |
| ELEC-128 | S-300 | Compresor 1 | Revisar: kW > kVA calculado; Revisar: kVA anotado difiere >15%; Fuente manuscrito | Revisar detalles OCR |
| ELEC-129 | S-310 | Compresor 2 | Revisar: kW > kVA calculado; Fuente manuscrito | Revisar detalles OCR |
| ELEC-133 | — | Mufla 1 | Falta potencia; Fuente manuscrito | — |
| ELEC-134 | — | Mufla 2 | Falta potencia; Fuente manuscrito | — |
| ELEC-135 | — | Horno 1 | Falta potencia; Fuente manuscrito | — |
| ELEC-136 | — | Horno 2 | Falta potencia; Fuente manuscrito | — |
| ELEC-137 | — | Absorción atómica | Falta potencia; Fuente manuscrito | — |
| ELEC-138 | — | Pulverizadora | Revisar: kVA anotado difiere >15%; Falta potencia; Fuente manuscrito | En el documento se indica 440 x 2 y 18 x 2; kVA 16,6 sin aclarar si es unitario o total. |
| ELEC-139 | — | Trituradora | Falta potencia; Fuente manuscrito | — |
| ELEC-140 | — | Muflas pequeñas | Falta potencia; Fuente manuscrito | — |
| ELEC-141 | — | Pulverizadora de arena | Revisar: kVA anotado difiere >15%; Falta potencia; Fuente manuscrito | — |
| ELEC-142 | — | Compresor | Revisar: kW > kVA calculado; Fuente revisar | La alineación manuscrita sugiere que estos valores pertenecen al compresor. |
| ELEC-143 | — | Plancha #1 | Falta potencia; Fuente manuscrito | — |
| ELEC-144 | — | Plancha #2 | Falta potencia; Fuente manuscrito | — |
| ELEC-145 | — | Extractor de lavado de ácido de laboratorio | Revisar: kW > kVA calculado; Falta kVA anotado; Fuente revisar | Aparecen 219 y 12,2 a la derecha; se interpretan como subtotal/notas, no como kVA del equipo. |
| ELEC-146 | — | Torno | Falta potencia; Fuente manuscrito | — |
| ELEC-147 | — | Fresa | Falta potencia; Fuente manuscrito | — |
| ELEC-148 | — | Taladro | Falta potencia; Fuente manuscrito | — |
| INV-001 | — | Balanza de camiones | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-002 | — | Tolva de alimentación de la línea 1 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-004 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-006 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-008 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-010 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-012 | — | Motor reductor | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-013 | — | Detector de metales | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-015 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-017 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-019 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-020 | — | Tolva de alimentación de la línea 2 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-033 | — | Silo N° 2 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-035 | — | Motor reductor | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-036 | — | Cinta transportadora N° 8 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-037 | — | Motor reductor | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-039 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-041 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-043 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-045 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-046 | — | Hidrociclón A | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-048 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-049 | — | Hidrociclón B | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-051 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-052 | — | Bomba de lubricación conjunto piñón-corona | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-053 | — | Bomba de lubricación de alta presión Molino N° 3 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-054 | — | Bomba de lubricación de baja presión Molino N° 3 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-055 | — | Bomba de lubricación conjunto piñón-corona | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-056 | — | Bomba de lubricación de cojinetes Molinos 1 y 2 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-057 | — | Cajón de bajo flujo de hidrociclones | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-058 | — | Sumidero de molienda | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-059 | — | Balanza de cinta N° 10 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-060 | — | Tanque pre-lix 1 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-062 | — | Tanque pre-lix 2 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-065 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-068 | — | Sistema hidráulico de espesador | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-101 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-109 | — | Bomba de transferencia de carbón CIL - 2 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-110 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-111 | — | Bomba de transferencia de carbón CIL - 3 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-112 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-113 | — | Bomba de transferencia de carbón CIL - 4 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-114 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-116 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-118 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-120 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-121 | — | Cajón de distribución de tanques CIP | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-122 | — | Tanque de carbón en pulpa N° 1 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-123 | — | Tanque de carbón en pulpa N° 2 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-124 | — | Tanque de carbón en pulpa N° 3 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-125 | — | Tanque de carbón en pulpa N° 4 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-126 | — | Tanque de carbón en pulpa N° 5 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-144 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-146 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-148 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-150 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-152 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-154 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-156 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-158 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-160 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-174 | — | Motor eléctrico | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-177 | — | Intercambiador de calor N° 3 | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-223 | — | Bomba de balsa | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-224 | — | Motor de la balsa | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-225 | — | Tanque de suministro de agua a oficinas | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-231 | — | Quemador | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-232 | — | Molino de escoria | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-233 | — | Balanza electrónica | Sin registro eléctrico estructurado | Revisar detalles OCR |
| INV-237 | — | Extractor de gases de electrólisis | Sin registro eléctrico estructurado | Revisar detalles OCR |

### 6.2 Incidencias específicas observadas
- En F3, el balance eléctrico transcrito muestra **4.121,6 kVA** frente a **4.200 kVA** anotados en el documento fuente: diferencia **−78,4 kVA**. No se ajustó el inventario automáticamente para forzar coincidencia.
- El registro **C-340 / molino de bolas primario** de F3 contiene **746 kW** y **95 kVA anotados**, combinación incompatible si se refieren a la misma carga y condición; requiere comprobar la transcripción y placa.
- Algunas filas del inventario técnico contienen fragmentos OCR desplazados entre columnas; validar fabricante, geometría y características contra placas, manuales y levantamiento en campo.
- Motores eléctricos y motorreductores registrados como renglones independientes no se fusionan automáticamente con la máquina accionada; verificar relación padre–hijo en el mapa de activos para evitar doble conteo de conjuntos.
- Homologar ortografía: elusión/elución, absorción/adsorción, PRE LIX/prelixiviación, carbón en pulpa/CIP. No cambiar de etapa de proceso un activo hasta confirmar su ubicación funcional.

## 7. Modelo recomendado para inventario verificado en campo
| Campo | Criterio |
|---|---|
| TAG único | Conservar código existente; asignar TAG a registros INV sin código solo tras verificar identidad. |
| Ubicación | Área, etapa, línea, nivel, coordenada/punto en plano y centro de costo. |
| Jerarquía | Sistema → subsistema → equipo → subconjunto → componente (ISO 14224 como referencia de taxonomía). |
| Trazabilidad | Fuente, página, fotografía de placa, revisión y responsable de validación. |
| Datos mecánicos | Capacidad, dimensiones, velocidad, caudal, presión, materiales, fabricante/modelo/serie. |
| Datos eléctricos | Tensión, potencia de placa, corriente, eficiencia, factor de potencia, servicio, MCC/VFD. |
| Estado | Instalado, operativo, reserva, fuera de servicio, retirado o pendiente de verificar; no asumir el estado a partir del nombre. |
| Mantenimiento | Criticidad, historial de fallas, repuestos, rutinas, manuales, instrumentos y P&ID asociados. |

## 8. Próximas acciones de ingeniería
1. Inspección física y etiquetado de cada registro, fotografiando placa y componentes asociados.
2. Resolver anomalías eléctricas: verificar valores escritos frente a placas y fórmulas trifásicas, bajo condiciones equivalentes.
3. Depurar relaciones máquina–motor–bomba/agitador sin eliminar registros válidos de componentes independientes.
4. Asignar código y ubicación a todos los activos `INV` sin TAG, con control de cambios y trazabilidad histórica.
5. Incorporar criticidad, planos GA/PFD/P&ID, unifilares, fichas FUR y referencias de mantenimiento una vez validados.

---
**Control documental:** REV00 — Documento derivado únicamente de los cuatro archivos entregados. No se incorporaron cifras de capacidad de diseño ajenas a los inventarios ni se consideraron estados operativos verificados en campo. La eliminación de duplicidad aplica a fuentes y registros conciliados, no a unidades físicas diferentes.
