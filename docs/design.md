# Design System & UI/UX Specification — Ecosistema FUR

**Proyecto:** Ecosistema Digital para Plantas de Beneficio de Oro  
**Archivo:** `design.md`  
**Versión:** 1.0  
**Stack de referencia:** React.js + TypeScript + Tailwind CSS + React Router + TanStack Query  
**Objetivo:** definir una fuente única de verdad visual y de interacción para todas las pantallas, dashboards, entidades y plantas del ecosistema.

---

## 1. Principios de diseño

El Ecosistema FUR debe sentirse como una sola plataforma, aunque contenga múltiples plantas, roles y módulos.

La UI debe comunicar:
- industria;
- tecnología;
- control;
- seguridad;
- trazabilidad;
- operación;
- confiabilidad;
- claridad.

Principios:
1. La identidad global del ecosistema no cambia por planta.
2. La planta cambia contexto, datos e imagen, no el lenguaje visual base.
3. El usuario siempre debe saber en qué planta está.
4. El usuario común puede navegar entre plantas visibles en modo solo lectura.
5. Las acciones de escritura dependen de `usuario + planta + rol + permiso`.
6. Redes y etapas se distinguen visualmente, pero sin competir con la identidad corporativa.
7. No depender exclusivamente del color para comunicar estado.
8. Toda pantalla debe contemplar loading, empty, error, read-only y responsive.

---

## 2. Identidad visual

### 2.1 Colores base

```css
:root {
  --fur-navy-950: #061A36;
  --fur-navy-900: #08254C;
  --fur-navy-800: #103866;
  --fur-navy-700: #184D7C;

  --fur-gold-600: #E89600;
  --fur-gold-500: #F5A800;
  --fur-gold-400: #FDBA2D;

  --fur-orange-500: #E87912;

  --fur-white: #FFFFFF;
  --fur-gray-50: #F7F9FC;
  --fur-gray-100: #EEF2F6;
  --fur-gray-200: #DCE3EB;
  --fur-gray-300: #CBD5E1;
  --fur-gray-500: #7B899A;
  --fur-gray-600: #58677A;
  --fur-gray-800: #283544;
  --fur-gray-900: #17202B;

  --fur-green-500: #1F9D55;
  --fur-red-500: #D74646;
  --fur-yellow-500: #E9B300;
  --fur-cyan-500: #2896D2;
  --fur-blue-500: #2563B8;
  --fur-purple-500: #7445C6;
  --fur-magenta-500: #D9468D;
  --fur-teal-500: #1B9C95;
  --fur-steel-500: #6B7788;
}
```

### 2.2 Uso principal

- **Navy:** navegación, headers, estructura, identidad principal.
- **Gold:** CTA, selección, active states y acciones principales.
- **Blanco / grises claros:** superficies, cards y fondos.
- **Colores de red:** acentos de dominio.
- **Verde / rojo / naranja / amarillo:** estados operacionales.

---

## 3. Colores por Red Transversal

| Red | Nombre | Color |
|---|---|---|
| FUR-PROC | Procesos | `#E87912` |
| FUR-PTE | Potencia Eléctrica | `#E9B300` |
| FUR-IOT | IoT / Instrumentación | `#2896D2` |
| FUR-GPON | Comunicaciones | `#7445C6` |
| FUR-CC | Control de Calidad | `#D74646` |
| FUR-LAB | Laboratorios | `#1B9C95` |
| FUR-MNT | Mantenimiento | `#6B7788` |
| FUR-RQ | Requisiciones | `#1F9D55` |
| FUR-OF | Ofertas Comerciales | `#D9468D` |
| FUR-CAM | Cámaras / Seguridad | `#2563B8` |

Regla: el color de red es acento secundario; nunca sustituye al navy corporativo.

---

## 4. Personalización por planta

Cada planta puede definir:
- logo;
- nombre;
- imagen;
- banner;
- descripción;
- fotografía industrial;
- redes habilitadas;
- etapas habilitadas.

No puede modificar:
- tipografía base;
- navbar;
- sistema de botones;
- sistema de permisos;
- semántica de estados;
- estructura de componentes;
- identidad navy + gold.

---

## 5. Tipografía

### Principal
`Inter`

### Técnica / códigos
`JetBrains Mono`

### Escala

```text
H1: 36px / 700
H2: 30px / 700
H3: 24px / 700
H4: 20px / 600
H5: 18px / 600
Body: 16px / 400
Body Small: 14px / 400
Caption: 12px / 400
Label: 13-14px / 600
Código técnico: 12-14px / 600 monospace
```

---

## 6. Espaciado

Sistema base: `4px`

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

Evitar valores arbitrarios.

---

## 7. Layout y breakpoints

### Grid
- Desktop: 12 columnas
- Tablet: 8 columnas
- Mobile: 4 columnas

### Breakpoints

```css
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### Ancho recomendado
`max-width: 1440px`

### Gutter
- Desktop: 24px
- Tablet: 20px
- Mobile: 16px

---

## 8. Radios y sombras

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 18px;
--radius-pill: 9999px;

--shadow-sm: 0 1px 2px rgba(15,23,42,.06);
--shadow-md: 0 4px 12px rgba(15,23,42,.08);
--shadow-lg: 0 12px 32px rgba(15,23,42,.12);
```

---

## 9. Estructura global

```text
Header superior
Navbar principal
Contenido contextual
Footer opcional
```

### Header superior
Debe incluir:
- logo;
- selector de planta;
- búsqueda global;
- favoritos;
- alertas;
- usuario;
- rol.

### Navbar principal

```text
Todo el ecosistema
Catálogo
Activos Físicos
Procesos
Marketplace
Proveedores
Servicios Profesionales
Cursos (LMS)
Redes Transversales
Mantenimiento
WMS / Inventario
Presupuestos (LULO)
Documentos
Dashboards
```

---

## 10. Selector de planta

El selector de planta no es un filtro visual: define el contexto de trabajo.

Debe mostrar:
- planta actual;
- plantas disponibles;
- favoritas;
- recientes.

Cambio de planta debe refrescar:
- activos;
- etapas;
- redes;
- mantenimiento;
- inventario;
- documentos;
- dashboards;
- presupuesto;
- KPIs.

---

## 11. Botones

### Primary
- Fondo: gold
- Texto: navy

### Secondary
- Fondo: blanco
- Border: navy
- Texto: navy

### Ghost
- Transparente
- Texto: navy

### Destructive
- Fondo: red
- Texto: blanco

### Disabled
- Fondo: gray-200
- Texto: gray-500

Alturas:
- 36px compacto
- 40px estándar
- 44px destacado

---

## 12. Inputs y formularios

Todo input debe tener:
- label;
- placeholder opcional;
- help text opcional;
- error state;
- disabled;
- read-only;
- focus visible.

Altura estándar: `40px`.

Tipos:
- text;
- number;
- date;
- select;
- multiselect;
- combobox;
- autocomplete;
- async select.

---

## 13. Filtros

Patrón recomendado:

```text
[Buscar] [Etapa] [Red] [Familia] [Estado] [Más filtros]
```

Filtros activos como chips:

```text
Etapa: D06 ×
Red: FUR-PROC ×
Estado: Operativo ×
```

Guardar filtros en URL:

```text
/assets?stage=D06&network=FUR-PROC&status=OPERATIVE
```

---

## 14. Tablas

Deben soportar:
- sorting;
- filtros;
- paginación;
- selección;
- columnas configurables;
- densidad;
- exportación;
- sticky header;
- acciones.

No mostrar más de 12 columnas simultáneamente.

### Tabla estándar de activos

```text
Tag
Activo
Etapa
Red
Estado
Criticidad
Ubicación
Último mantenimiento
Responsable
Acciones
```

---

## 15. Cards

### Card base
- Fondo blanco
- Border gray-200
- Radius 14px
- Padding 20px

### AssetCard
Debe mostrar:
- imagen / icono;
- tag;
- nombre;
- familia;
- etapa;
- estado;
- criticidad;
- redes;
- ubicación;
- acciones rápidas.

### PlantCard
Debe mostrar:
- logo / imagen;
- nombre;
- estado;
- disponibilidad;
- producción;
- activos;
- alarmas.

### NetworkCard
Debe mostrar:
- icono;
- código;
- nombre;
- descripción;
- activos relacionados;
- estado;
- acceso a dashboard.

### KpiCard
Debe mostrar:
- título;
- valor;
- unidad;
- variación;
- tendencia;
- icono.

---

## 16. Estados del activo

| Estado | Color | Icono sugerido |
|---|---|---|
| Operativo | Verde | CheckCircle |
| En mantenimiento | Naranja | Wrench |
| Fuera de servicio | Rojo | XCircle |
| Crítico | Rojo oscuro | AlertCircle |
| En espera | Amarillo | Clock |
| Comisionamiento | Cyan | Activity |
| En stock | Azul | Package |
| En reparación | Púrpura | Tool |

Regla: usar `icono + texto + color`.

Ejemplo:

```text
● Operativo
```

---

## 17. FUR — Ficha Única de Registro

La FUR es una de las pantallas centrales.

### Header

```text
MB-301
Molino de bolas
Operativo
Crítico
Planta REVEMIN II
D06 — Molienda Primaria
```

### Acciones

```text
Crear OT
Solicitar repuesto
Ver documentos
Editar
Más
```

### Tabs

```text
Resumen
Datos técnicos
Mantenimiento
Inventario / BOM
Documentos
Telemetría
Historial
Costos
KPIs
```

---

## 18. Breadcrumbs

Ejemplo:

```text
Planta REVEMIN II / Activos / Molienda Primaria / MB-301
```

Usar siempre en páginas profundas.

---

## 19. Modales y drawers

### Modal
Usar para:
- confirmación;
- formularios cortos;
- información breve.

### Drawer
Usar para:
- filtros avanzados;
- edición ligera;
- detalle rápido;
- preview.

No usar modal para flujos extensos.

---

## 20. Estados UI obligatorios

Toda pantalla debe implementar:

```text
Loading
Empty
Error
Read-only
Disabled
Success
Warning
```

### Loading
Usar skeletons.

### Empty
Ejemplo:

```text
No hay activos registrados en esta etapa.
```

Mostrar CTA solo si existe permiso.

### Error
Debe incluir:
- mensaje;
- acción;
- reintentar;
- volver.

---

## 21. Dashboard de Planta

Bloques:

```text
Estado general
Disponibilidad
Producción
Activos
Alarmas
Mantenimiento
Inventario
Energía
Calidad
KPIs
```

---

## 22. Dashboard Administrador del Ecosistema

```text
Plantas
Usuarios
Roles
Permisos
Catálogos
Redes maestras
Etapas maestras
Integraciones
Auditoría
Salud del sistema
```

---

## 23. Dashboard Administrador de Planta

```text
Resumen operacional
Activos
Etapas
Redes
Mantenimiento
Inventario
Requisiciones
Documentos
Usuarios
Alertas
KPIs
```

---

## 24. Dashboard Proveedor

```text
Productos
Marketplace
Precios
Cotizaciones
RFQ
Pedidos
Documentación
Métricas comerciales
```

---

## 25. Dashboard Contratista

```text
Servicios
Etapas atendidas
Disponibilidad
Solicitudes
Propuestas
Contratos
Documentación
Calificaciones
```

---

## 26. Dashboard Mantenimiento

```text
Backlog
OT abiertas
OT vencidas
Preventivo
Predictivo
Correctivo
MTBF
MTTR
Costos
Repuestos críticos
```

---

## 27. Dashboard Inventario

```text
Stock
Stock crítico
Repuestos críticos
Movimientos
Reservas
Activos en reparación
Activos en stock
Entradas
Salidas
```

---

## 28. Dashboard Presupuesto / LULO

```text
Presupuesto total
Costo directo
Costo indirecto
APU
Partidas
Desviaciones
Avance
Valuaciones
Escenarios
```

---

## 29. Dashboard Usuario común

Modo solo lectura.

Puede ver:
- plantas visibles;
- procesos;
- activos públicos;
- indicadores públicos;
- marketplace;
- proveedores;
- servicios;
- cursos;
- documentos públicos.

No mostrar:
- crear;
- editar;
- eliminar;
- aprobar;
- asignar;
- configurar.

---

## 30. Procesos

Dos modos:

### Mapa
Diagrama visual navegable.

### Tabla
Etapas + activos + estados.

El mapa debe permitir:
- zoom;
- selección;
- tooltip;
- click en etapa;
- click en activo;
- estado;
- colores por grupo.

---

## 31. Etapas

Cada etapa debe mostrar:

```text
Código
Nombre
Descripción
Activos
Estado
KPIs
Documentos
```

Ejemplo:

```text
D06 — Molienda Primaria
```

---

## 32. Colores sugeridos por grupo de etapas

```text
Recepción / Trituración → naranja
Molienda / Clasificación → azul
Lixiviación → verde
Elución / Recuperación → amarillo
Carbón → púrpura
Relaves → cyan / azul
```

Estos colores son de orientación, no de estado.

---

## 33. Marketplace

ProductCard:

```text
Imagen
Nombre
Familia
Proveedor
Precio
Disponibilidad
Etapas relacionadas
Rating
```

CTA:
- Ver producto
- Solicitar cotización

Filtros:
- etapa;
- familia;
- tipo;
- proveedor;
- precio;
- fabricante.

---

## 34. Proveedores

ProviderCard:

```text
Logo
Nombre
Familias
Etapas
Rating
Certificaciones
Ubicación
```

---

## 35. Servicios Profesionales

ServiceCard:

```text
Contratista
Especialidad
Etapas
Disponibilidad
Rating
Certificaciones
```

---

## 36. Cursos

CourseCard:

```text
Título
Etapa
Nivel
Duración
Instructor
Certificado
Progreso
```

---

## 37. Redes Transversales

Mostrar solo redes habilitadas en la planta actual.

Grid recomendado.

Cada red:
- código;
- nombre;
- color;
- icono;
- descripción;
- activos;
- indicadores;
- acceso a dashboard.

---

## 38. Mantenimiento

Vistas:

```text
Dashboard
Lista de OT
Kanban
Calendario
Planes
Activos
Fallas
Inspecciones
Repuestos
Costos
```

### Kanban OT

```text
Solicitada
Planificada
Asignada
En ejecución
En espera
Completada
Cerrada
```

---

## 39. WMS / Inventario

Tabs:

```text
Stock
Activos
Repuestos
Consumibles
Herramientas
Movimientos
Almacenes
Ubicaciones
Reparaciones
```

Estados relevantes:

```text
Operativo
En stock
En reparación
Reservado
En tránsito
Baja
```

No mezclar inventario interno con inventario comercial de proveedores.

---

## 40. Documentos

Layout recomendado:

```text
Carpetas / categorías
Listado
Preview
Metadata
Versiones
```

Soportar:
- PDF;
- imágenes;
- documentos Office;
- manuales;
- planos;
- SOP;
- procedimientos.

Acciones:
- visualizar;
- descargar;
- versiones;
- relacionar;
- permisos;
- historial.

---

## 41. Búsqueda global

Placeholder:

```text
Buscar activos, procesos, servicios, cursos, proveedores, documentos...
```

Resultados agrupados:

```text
Activos
Etapas
Documentos
Marketplace
Proveedores
Cursos
Servicios
```

---

## 42. Iconografía

Librería recomendada:

```text
Lucide Icons
```

Tamaños:
- 16px compacto
- 20px estándar
- 24px navegación
- 32px cards destacadas

No mezclar librerías innecesariamente.

---

## 43. Charts

Tipos recomendados:
- line;
- area;
- bar;
- stacked bar;
- donut;
- gauge;
- heatmap;
- timeline.

No usar gráficos 3D.

Orden de colores:

```text
navy
gold
blue
green
purple
orange
teal
red
```

---

## 44. Telemetría

Cada variable debe mostrar:

```text
Nombre
Valor
Unidad
Timestamp
Calidad
Estado
```

Ejemplo:

```text
Temperatura rodamiento
72.4 °C
Hace 8 s
Calidad: Good
```

---

## 45. Alarmas

AlarmCard:

```text
Severidad
Activo
Variable
Valor
Umbral
Hora
Estado
```

Severidades:

```text
Info
Warning
Alarm
Critical
```

---

## 46. UX de Presupuesto / LULO

Layout:

```text
Sidebar de estructura
Editor central
Panel de totales
Toolbar
```

### Editor APU

```text
Código
Recurso
Tipo
Unidad
Cantidad
Rendimiento
Precio
Subtotal
```

Sticky footer:

```text
Costo directo
Indirectos
Precio unitario
```

---

## 47. Read-only mode

Para usuarios consumidores:
- mostrar vistas de detalle;
- ocultar herramientas de gestión;
- no mostrar formularios disabled innecesariamente.

Preferir lectura natural sobre formularios bloqueados.

---

## 48. Permisos en UI

Ejemplo:

```tsx
<PermissionGate permission="asset.update">
  <Button>Editar activo</Button>
</PermissionGate>
```

La UI nunca debe ofrecer una acción que el backend rechazará por falta de permisos.

---

## 49. Responsive

### Desktop
Experiencia principal.

### Tablet
Funcionalidad completa.

### Mobile
Priorizar:
- consulta;
- FUR;
- alertas;
- OT;
- inventario;
- dashboards resumidos.

La navbar pasa a drawer.

---

## 50. Design Tokens

Archivo sugerido:

```text
src/styles/tokens.css
```

```css
:root {
  --color-primary: var(--fur-navy-900);
  --color-accent: var(--fur-gold-500);
  --surface-page: var(--fur-gray-50);
  --surface-card: var(--fur-white);
  --border-default: var(--fur-gray-200);
  --text-primary: var(--fur-gray-900);
  --text-secondary: var(--fur-gray-600);
}
```

---

## 51. Tailwind mapping

```js
colors: {
  fur: {
    navy: {
      950: '#061A36',
      900: '#08254C',
      800: '#103866'
    },
    gold: {
      500: '#F5A800',
      400: '#FDBA2D'
    }
  }
}
```

---

## 52. Arquitectura de componentes

```text
components/
├── base/
│   ├── Button
│   ├── Input
│   ├── Select
│   ├── Badge
│   ├── Card
│   ├── Modal
│   ├── Drawer
│   └── Tabs
├── data/
│   ├── DataTable
│   ├── Pagination
│   ├── FilterBar
│   └── SearchInput
├── industrial/
│   ├── AssetCard
│   ├── FurHeader
│   ├── StageCard
│   ├── NetworkCard
│   ├── AssetStatusBadge
│   ├── TelemetryChart
│   └── AlarmBadge
└── layout/
    ├── AppHeader
    ├── MainNavbar
    ├── Sidebar
    ├── PageHeader
    └── PlantSelector
```

---

## 53. Page Templates

### Lista

```text
PageHeader
FilterBar
KPIs opcionales
DataTable / Grid
Pagination
```

### Detalle

```text
Breadcrumb
EntityHeader
KPIs
Tabs
Content
```

### Dashboard

```text
PageHeader
PeriodSelector
KPI Grid
Charts
Tables
Alerts
```

---

## 54. UX multi-planta

Nunca mezclar datos de dos plantas sin indicarlo explícitamente.

Contexto visible:

```text
PLANTA: REVEMIN II
```

o:

```text
ECOSISTEMA GLOBAL
```

En vistas globales, las tablas deben incluir columna `Planta`.

---

## 55. Accesibilidad

Objetivo mínimo:

```text
WCAG 2.1 AA
```

Requisitos:
- contraste;
- navegación por teclado;
- focus visible;
- labels;
- aria;
- no depender solo del color;
- zoom 200%;
- targets táctiles adecuados.

---

## 56. Naming visual

Usar siempre los mismos términos:

```text
Activos Físicos
Procesos
Redes Transversales
WMS / Inventario
Presupuestos (LULO)
Cursos (LMS)
Servicios Profesionales
```

No renombrar por pantalla.

---

## 57. Convención de códigos

Mostrar con fuente monoespaciada:

```text
D06
MB-301
FUR-IOT
OT-2026-00418
RQ-2026-00102
```

---

## 58. Formato de datos

### Fechas

```text
01 oct 2026
14:32
```

### Producción

```text
3,450 t/d
```

### Disponibilidad

```text
95.2%
```

### Costos

```text
USD 125,430.50
```

---

## 59. Estados de sincronización

Para Odoo / OT:

```text
Sincronizado
Pendiente
Error
Desactualizado
```

---

## 60. Estado en tiempo real

Cuando una métrica sea realtime:

```text
En vivo
```

Cuando los datos estén atrasados:

```text
Datos atrasados
```

Mostrar siempre:

```text
Última actualización
```

---

## 61. Onboarding de administrador

Secuencia sugerida:

```text
1. Crear planta
2. Configurar datos generales
3. Habilitar etapas
4. Habilitar redes
5. Asignar usuarios
6. Registrar activos
7. Configurar documentos
8. Activar módulos
```

---

## 62. Onboarding de usuario común

```text
1. Seleccionar planta
2. Conocer el ecosistema
3. Explorar procesos
4. Consultar activos
5. Acceder a marketplace, cursos y documentación pública
```

---

## 63. Storybook

Se recomienda documentar en Storybook:

```text
Button
Input
Select
Badge
Card
DataTable
AssetCard
NetworkCard
FurHeader
AlarmBadge
KpiCard
PlantSelector
```

---

## 64. QA visual

Cada componente debe probar:

```text
default
hover
focus
disabled
loading
error
empty
read-only
mobile
```

---

## 65. Definition of Done UI

Una pantalla se considera terminada cuando:

- usa tokens;
- reutiliza componentes existentes;
- respeta permisos;
- tiene responsive;
- contempla loading;
- contempla empty;
- contempla error;
- contempla read-only;
- cumple accesibilidad básica;
- conserva identidad FUR;
- mantiene contexto de planta visible.

---

## 66. Checklist para nuevos módulos

```text
[ ] ¿Es global o por planta?
[ ] ¿Qué roles acceden?
[ ] ¿Es lectura o escritura?
[ ] ¿Qué filtros necesita?
[ ] ¿Qué estados utiliza?
[ ] ¿Necesita dashboard propio?
[ ] ¿Qué componentes existentes reutiliza?
[ ] ¿Se relaciona con etapa?
[ ] ¿Se relaciona con red?
[ ] ¿Qué permisos necesita?
[ ] ¿Cómo se comporta en mobile?
```

---

## 67. Principio final

> **La complejidad debe estar en la arquitectura interna, no en la experiencia del usuario.**

El usuario debe comprender siempre:

```text
Dónde está
En qué planta está
Qué está viendo
Qué puede hacer
Qué estado tiene la entidad
Cómo volver
```

El diseño debe hacer que Catálogo, Activos Físicos, Procesos, Marketplace, Proveedores, Servicios Profesionales, Cursos, Redes Transversales, Mantenimiento, Inventario, Presupuestos, Documentos y Dashboards se perciban como partes de un mismo Ecosistema FUR.
