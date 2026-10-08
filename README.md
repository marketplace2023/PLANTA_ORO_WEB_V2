# Ecosistema Digital FUR

Plataforma multi-planta para plantas de beneficio de oro.
Diseño y arquitectura: [docs/design.md](docs/design.md) · [docs/Ecosistema_FUR_Arquitectura_Tecnica.md](docs/Ecosistema_FUR_Arquitectura_Tecnica.md)

## Stack

| Capa | Tecnología |
|---|---|
| Frontend `apps/web` | React 19 + TypeScript + Vite + Tailwind v4 + **shadcn/ui** + React Router + TanStack Query |
| Backend `apps/api` | **NestJS 11** + Drizzle ORM + `pg` |
| Base de datos | PostgreSQL 17 — **local** (embebido) en desarrollo; Neon al publicar |
| Pruebas | Jest + Supertest (API, contra Postgres local) · Vitest + Testing Library (web) |

## Desarrollo 100 % local (sin nube, sin costo)

Requiere Node ≥ 20.19. No requiere Docker ni cuentas externas.

```bash
npm install
npm run db:local        # Terminal 1: Postgres local en :54320 (déjalo corriendo, Ctrl+C lo detiene)
npm run setup:local     # Terminal 2 (una vez): migra y siembra catálogos, roles, permisos y datos de demo
npm run dev:app         # API en :3000 + web en :5173
```

`npm run dev` levanta las tres cosas a la vez (Postgres + API + web) si prefieres una sola terminal.

Los archivos `apps/api/.env` y `apps/web/.env` ya apuntan a local; no se versionan (usa los `.env.example` como plantilla).
Los datos viven en `.local/pgdata` (ignorado por git). Para empezar de cero: detén `db:local`, borra `.local/` y repite `setup:local`.

Comprobación: `http://localhost:3000/api/v1/health`.

### Usuarios de demo (solo local)

Contraseña de todos: `fur-local-2026` (la crea `npm run db:seed:dev`, que se niega a correr con `NODE_ENV=production`).

| Usuario | Qué puede hacer |
|---|---|
| `admin@fur.local` | Administrador del ecosistema: ve y edita todo, crea plantas |
| `gerente@fur.local` | Administrador de planta en REVEMIN II |
| `caratal@fur.local` | Administrador de **Planta Caratal** (solo ve y gestiona esa planta) |
| `colombia@fur.local` | Administrador de **Mina Colombia** (solo esa planta) |
| `sosamendez@fur.local` | Administrador de **Mina Sosa Méndez** (solo esa planta) |
| `mantenimiento@fur.local` | Jefe de mantenimiento en REVEMIN II |
| `almacen@fur.local` | Almacén / logística en REVEMIN II |
| `compras@fur.local` | Compras en REVEMIN II (crea y aprueba requisiciones, pide y adjudica cotizaciones) |
| `presupuestos@fur.local` | Presupuestos en REVEMIN II: crea y edita presupuestos, APU y precios, pero **no aprueba** |
| `proveedor@fur.local` | Responsable del proveedor *Repuestos Andinos* (sin acceso a plantas; cotiza RFQ) |
| `contratista@fur.local` | Responsable del contratista *Mecánica Industrial Minera* |
| *(cualquiera con sesión)* | Se inscribe en cursos; `lector@fur.local` ya viene con un curso a medias |
| `lector@fur.local` | Usuario común: sin rol, solo lectura |
| *(sin sesión)* | Solo plantas públicas (REVEMIN II) |

Plantas registradas (4, **independientes entre sí**): **REVEMIN II**, **Planta Caratal**, **Mina Colombia** y **Mina Sosa Méndez**. Cada una tiene su propia configuración (etapas y redes habilitadas), activos con su código FUR, inventario, planes y órdenes de mantenimiento, y un administrador que solo accede a la suya: lo que ocurre en una planta no se ve ni se puede tocar desde otra (los códigos y SKU pueden repetirse entre plantas, como `MB-01` o `ROD-6310`, porque son únicos **por planta**). Su ficha es pública, pero su información operativa (procesos, activos, documentos) no se publica hasta que se active en *Editar planta*. Los datos de las tres plantas nuevas son de **demostración** y País/huso horario quedan por completar: se corrigen desde la propia app, y volver a correr `npm run db:seed:dev` **no pisa** lo que edites en ellas (solo REVEMIN II se restablece). Las plantas de ejemplo antiguas (Norte y Piloto) se retiran si siguen vacías.

### Seguridad y permisos

- **Autenticación:** contraseñas con Argon2id; access token JWT de 15 min en memoria del navegador; refresh token opaco, rotativo y en cookie httpOnly (con detección de reutilización); límite de intentos en `/auth/*`.
- **Autorización:** `usuario + planta + rol + permiso`, evaluada en la base de datos en cada petición. Matriz rol → permisos en [apps/api/src/modules/iam/permissions.catalog.ts](apps/api/src/modules/iam/permissions.catalog.ts); permisos excepcionales ALLOW/DENY por usuario y planta.
- **Visibilidad de plantas:** `PUBLIC` (cualquiera), `AUTHENTICATED` (con sesión), `PRIVATE` (solo miembros; para el resto devuelve 404, no 403).
- **Auditoría:** altas, cambios y asignaciones quedan en `audit.events` con valor anterior/nuevo y correlation id.

### Administración

- **Planta** (`/plants/:slug/admin`, botón *Administrar* del tablero): miembros y roles (`user.read` / `user.assign`), y habilitar o deshabilitar etapas y redes (`plant.configure`). No se puede deshabilitar una etapa o red que aún tiene activos.
- **Catálogo global** (`/admin/catalog`, solo administrador del ecosistema): familias, tipos, fabricantes y modelos; los códigos son inmutables y los modelos se desactivan, no se borran.

### Activos físicos y ficha FUR

- **Catálogo global** (`/catalog`): familias, tipos, fabricantes y modelos. Describe *qué existe*, no qué posee una planta. Lectura pública. Se filtra primero por **etapa del proceso** (D01–D20, `?stage=D06`) y después por **red transversal** (`?network=FUR-PTE`); ambos se combinan con familia, fabricante y búsqueda. Las etapas y redes se asignan al **tipo** de activo (tablas `catalog.asset_type_stages` y `catalog.asset_type_networks`), por lo que todos sus modelos las heredan; `GET /catalog/types` y cada modelo las devuelven como `stageCodes` / `networkCodes`. El seed deja asignados los tipos base (sin pisar lo que el administrador cambie) y el administrador las edita al crear o editar un tipo (`stageCodes` / `networkCodes` en `POST/PATCH /catalog/types`). Un tipo sin etapa o red no aparece al filtrar por ellas.
- **Foto del modelo:** el administrador del ecosistema adjunta una imagen por modelo (`POST /catalog/models/:id/image`, campo `file`; `DELETE` la quita). Solo PNG, JPG o WebP de hasta 5 MB, validados por su contenido real (SVG y HTML se rechazan a propósito). Se guarda en el almacenamiento de objetos (`STORAGE_DIR`), se sirve pública en `GET /catalog/models/:id/image` y cada modelo expone `imageUrl` (ruta relativa a la API). Subir, reemplazar y quitar quedan en la auditoría.
- **Registro de empresas (proveedores):** `POST /providers` con `selfRegistration: true` (lo que hace el portal) deja la empresa **PENDIENTE** y a quien la registra como su **responsable**, también si es administrador del ecosistema; el administrador la aprueba desde el panel de administración (*Proveedores y contratistas*). Sin ese campo, un administrador crea la empresa ya activa (y puede asignar `ownerEmail`).
- **Fotos en el marketplace:** el proveedor sube la foto de cada producto (`POST /providers/:id/listings/:listingId/image`) y el logo de su empresa (`POST /providers/:id/logo`); `DELETE` las quita. Misma validación que el catálogo (PNG/JPG/WebP ≤ 5 MB por contenido real). `imageUrl` / `logoUrl` pueden ser una URL externa o una ruta de la API (`/marketplace/listings/:id/image`, `/providers/:id/logo`); poner una URL externa descarta la foto subida. Se gestionan desde el portal de proveedores (`planta_beneficio_oro_suppliers`).
- **Contratistas (servicios profesionales):** igual que los proveedores, `POST /contractors` con `selfRegistration: true` deja la empresa *pendiente* con quien la registra como responsable (también para administradores), y el contratista sube su logo en `POST /contractors/:id/logo` (`GET` público, `DELETE` lo quita). Se gestionan desde el portal de servicios profesionales (`professional_services`, :5179).
- **Redes transversales (maestro):** lectura pública en `GET /networks/catalog`. El administrador del ecosistema las gestiona con `POST /networks/catalog` (`code` con formato `FUR-` + 2–16 letras, inmutable; `name`, `description?`, `icon?`, `colorToken?` con formato `network-xx`, uno de los colores definidos en las hojas de estilo), `PATCH /networks/catalog/:id` y `DELETE /networks/catalog/:id`. Eliminar una red habilitada en plantas responde 409 con el detalle; con `?force=true` también se quita de esas plantas, se desvincula de sus activos y de los tipos del catálogo. `GET /networks/catalog/usage` (administrador) devuelve cuántas plantas, activos y tipos usan cada red. Todo queda auditado. El seed solo crea las redes base que falten: no pisa lo que se edite, aunque sí vuelve a crear una red base eliminada si se ejecuta de nuevo.
- **Una cuenta para todos los portales y aprobación del administrador:** `POST /auth/register` crea una cuenta única; la misma credencial entra al panel de planta, proveedores, cursos y servicios profesionales. Crear la cuenta no da acceso a nada: cada portal ofrece su propio registro y el administrador del ecosistema aprueba. Proveedores y contratistas se registran con `selfRegistration` (quedan *pendientes*; aprobación en Administración → Proveedores y contratistas). El portal de cursos permite registrar una organización (proveedor o contratista). Para el panel de planta hay **solicitudes de acceso**: `POST /plant-access-requests` `{ plant: slug|uuid, message? }` (solo plantas que la persona ya ve; una pendiente por planta), `GET /plant-access-requests/mine`, `POST /plant-access-requests/:id/cancel`; el administrador las ve en `GET /admin/plant-access-requests?status=PENDING|APPROVED|REJECTED|CANCELLED|ALL` y decide con `POST …/:id/approve` `{ roleCode, note? }` (crea la asignación usuario ↔ planta ↔ rol) o `…/reject`. Todo queda auditado y el dashboard del ecosistema cuenta las pendientes (`access.pendingRequests`). El panel de administración no tiene registro público. Política de seguridad definitiva pendiente de análisis.
- **Geoportal de Activos Físicos** (web, `/plants/:slug/assets`): vista por defecto de los activos de la planta, con la tabla completa disponible en «Lista» (`?view=lista`). Franja de indicadores, listado de etapas habilitadas con su conteo, redes transversales como segundo filtro, **mapa de la planta con las etapas y los activos marcados encima** (capas «Activos físicos», «Etapas» y «Redes»; ampliable), ficha de la etapa elegida con sus tarjetas de activos y, a la derecha, la **ficha técnica general** del activo elegido (foto del modelo, estado, código FUR, tipo, modelo, etapa, redes, criticidad, ubicación y especificaciones; enlace a la FUR completa). La etapa, la red, el activo y la búsqueda viven en la URL (`?stage=D06&network=FUR-PTE&asset=…&search=…`). Los conteos salen de `GET /plants/:slug/assets/summary` (por estado, criticidad, etapa y red, sin dados de baja y con el mismo alcance que el listado).
  - **Posiciones en el mapa:** `mapPosition: {x, y}` en porcentaje (0–100) del ancho y del alto de la imagen. Las devuelven el listado/detalle de activos y el listado de etapas (visibles para quien ve esos datos). Se guardan con `PATCH /plants/:slug/assets/:id` (permiso `asset.update`; vive en `metadata.map` y no pisa el resto de los metadatos) y `PATCH /plants/:slug/stages/:id` (permiso `plant.configure`; vive en `configuration.map`); `null` la quita. En la pantalla, «Ubicar en el mapa» permite colocar la etapa o el activo elegidos con un clic. Hasta que se ubican, el mapa se muestra sin marcadores.
- **Activos de planta** (`/plants/:slug/assets`): instancias físicas creadas a partir de un modelo del catálogo. Cada una recibe un código FUR permanente y consecutivo por planta (`FUR-REV-II-00042`), generado con un contador atómico.
- **Integridad (§47):** un activo solo puede ir a una etapa y a redes *habilitadas* en su planta; el tag es único por planta; no hay ciclos en la jerarquía; no se puede deshabilitar una etapa o red que aún tiene activos.
- **Estados y baja:** cada cambio de estado queda en un historial inmutable con su motivo. La baja es lógica (`DELETE` → `DECOMMISSIONED`): el activo y su historial se conservan.
- **Ficha FUR** (`/plants/:slug/assets/:id`, API `GET …/assets/:id/fur`): resumen, datos técnicos e historial. Mantenimiento, inventario/BOM, documentos, telemetría, costos y KPIs se habilitan en fases posteriores.
- **Visitantes:** solo ven activos marcados como públicos *y* si la planta publica sus activos; reciben una versión sin número de serie, metadatos ni historial.

### Mantenimiento (`/plants/:slug/maintenance`)

- **Información interna:** no hay vista pública; todo exige `maintenance.read`. Sin ese permiso la pantalla lo explica y la pestaña de la FUR no recibe datos.
- **Órdenes de trabajo** (`OT-AAAA-NNNNN`, contador atómico por planta y año): flujo *Solicitada → Planificada → Asignada → En ejecución ⇄ En espera → Completada → Cerrada* (o *Cancelada*). Completar exige describir el trabajo; cancelar, el motivo; asignar, un responsable válido (miembro con acceso a mantenimiento). Cada transición queda en un historial y en auditoría, con bloqueo optimista (dos cambios simultáneos no se pisan).
- **Permisos por transición:** quien solicita solo necesita `maintenance.create` (p. ej. operador); planificar/asignar/cancelar, `maintenance.update`; **cerrar** es una aprobación (`maintenance.close`, p. ej. gerente); y el **técnico asignado** puede iniciar, pausar y completar su orden con solo lectura.
- **Planes** (preventivo, predictivo, por condición): definen frecuencia y próxima fecha; *Generar OT* crea la orden y avanza el calendario desde la fecha anterior (no desde hoy). No genera si el plan ya tiene una orden abierta ni si está pausado. No hay planificador automático todavía.
- **Vistas:** Dashboard (OT abiertas, backlog, vencidas, MTTR, cumplimiento preventivo, por tipo y estado), lista con filtros en la URL, Kanban (se mueve con menú, accesible por teclado) y Planes.
- **Repuestos usados:** una orden *en ejecución, en pausa o terminada (sin cerrar)* consume stock del inventario (lo registra el responsable o quien edita la orden) y se pueden devolver; el costo de la OT es la suma de lo consumido al costo promedio vigente. El tablero muestra el costo de las órdenes terminadas en los últimos 30 días (repuestos + resto) y la FUR el acumulado por activo.
- **Mano de obra, equipos, transporte y servicios:** además de los repuestos, una orden registra *costos* (tipo, cantidad, costo unitario) con las mismas reglas de estado y de quién puede hacerlo que los repuestos (responsable o `maintenance.update`). Pueden tomar su precio del **libro de precios de Presupuestos** (solo recursos del mismo tipo, con `budget.read`): el precio se convierte a la moneda de la planta con el tipo de cambio vigente y queda como **foto** (si luego cambia el precio del recurso, el costo ya registrado no cambia). Sin recurso se describen y se dan a mano; los servicios externos y otros siempre son manuales. Cada alta/baja queda auditada.
- **Costos del activo** (pestaña *Costos* de la FUR, `GET …/maintenance/assets/:id/costs`): total y desglose por categoría (repuestos, mano de obra, equipos, transporte, servicios y otros), serie de los últimos 12 meses, por tipo de orden y las órdenes de mayor costo. Excluye las órdenes canceladas; los repuestos sin costo cargado se cuentan aparte (no suman ni se ocultan). La depreciación aún no se calcula.
- **Indicadores no disponibles:** MTBF se muestra como "—" con su causa (requiere registro de fallas); nunca se inventa.

### Documentos (`/plants/:slug/documents`)

- **Modelo:** un documento lógico (título, tipo, visibilidad) con **versiones inmutables**: subir una nueva versión conserva las anteriores. Se vincula a activos y etapas, y aparece en la pestaña *Documentos* de la ficha FUR.
- **Almacenamiento:** el binario va a un driver de almacenamiento (hoy disco local en `STORAGE_DIR`, por defecto `apps/api/.local/storage`); la base de datos solo guarda metadatos, checksum SHA-256 y `storage_key`. El driver S3 se añade implementando `StorageService`.
- **Seguridad de la subida:** lista blanca de extensiones **y** verificación del contenido (firma del archivo); HTML y SVG se rechazan a propósito (XSS almacenado); el tipo lo decide el servidor, nunca el `Content-Type` del cliente; nombres saneados contra *path traversal*; tope `MAX_UPLOAD_MB` (25 por defecto); los permisos se validan antes de procesar el archivo.
- **Seguridad de la descarga:** `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, solo PDF/imágenes en línea (con CSP `sandbox`) y todo lo demás como descarga. Los documentos internos se bajan con *fetch* + token (no hay enlaces públicos a archivos privados).
- **Visibilidad:** `INTERNAL` (por defecto) solo para quien tiene `document.read`; `PUBLIC` solo si además la planta publica sus documentos. Los visitantes ven únicamente la versión vigente. Archivar oculta el documento sin borrar archivos ni auditoría; las descargas de documentos internos quedan auditadas.

### Inventario / WMS (`/plants/:slug/inventory`)

- **Interno:** nada es público (el inventario comercial de proveedores vive aparte, en el marketplace). Lee `inventory.read`; crea almacenes/ubicaciones/ítems `inventory.create`; edita `inventory.update`; mueve stock `inventory.move` (almacén).
- **Modelo:** almacenes → ubicaciones (zona/rack/estante/bin) → ítems (repuesto, consumible, herramienta) → existencias por ubicación + libro de movimientos inmutable (ingreso, salida, transferencia, ajuste). SKU y unidad de medida no cambian tras crear.
- **Integridad:** el saldo nunca es negativo (condición en la base **y** `UPDATE` condicional: salidas simultáneas no sobregiran); el costo es un **promedio ponderado** que se recalcula solo en ingresos con costo (una devolución no revalora); los ajustes exigen motivo; no se desactiva una ubicación/almacén con existencias; los movimientos del mismo ítem se serializan con bloqueo de fila.
- **Vistas:** Dashboard (valor del stock, bajo mínimo, críticos, movimientos 30 días, activos en stock/reparación), Stock, Movimientos y Almacenes. Las **reservas** se muestran como "—" hasta que exista su planificación.

### Compras: requisiciones, RFQ y cotizaciones (pestaña *Requisiciones* de Mantenimiento)

- **Flujo:** *Borrador → Por aprobar → Aprobada/Rechazada → En cotización → Pedida → Recibida* (o *Cancelada* antes de pedir). Código `RQ-AAAA-NNNNN`. Se puede crear desde cero, desde los ítems **bajo mínimo** del inventario o desde una orden de trabajo.
- **Separación de funciones:** nadie aprueba ni rechaza su propia requisición (salvo el administrador del ecosistema); quien solo crea no adjudica; recibir stock exige `inventory.move`.
- **RFQ:** se invita a proveedores activos con plazo. El proveedor (miembro de la organización) ve solo líneas, cantidades y fecha requerida —**nunca** la justificación ni los precios estimados—, y cotiza o retira su cotización mientras el RFQ esté abierto y no venza el plazo. Adjudicar cierra el RFQ y rechaza las demás; adjudicar y cotizar en paralelo no dejan cotizaciones vigentes en un RFQ cerrado.
- **Recepción:** total o parcial; las líneas con ítem ingresan stock (movimiento con referencia a la requisición, costo promedio actualizado); nunca se recibe más de lo pedido. Pedidos/órdenes de compra formales quedan para una fase posterior.

### Proveedores, Marketplace y Servicios Profesionales

- **Organizaciones globales:** proveedores y contratistas no pertenecen a una planta; los gestionan sus **miembros** (responsable o miembro) y el administrador del ecosistema. Cualquier usuario con sesión *solicita* el registro (queda **Pendiente**, invisible al público); el administrador la aprueba y es el único que cambia nombre, identificación tributaria, país, estado, **verificación** y **rating** (sin calificaciones → "Sin calificaciones", nunca un valor inventado).
- **Público:** `/marketplace` (filtros: etapa, familia, tipo, fabricante, proveedor, precio, disponibilidad), `/providers` (etapa, familia, país, certificación, rating) y `/professionals` (etapa, especialidad, ubicación, certificación, disponibilidad). Solo se muestran organizaciones **activas** y productos **publicados**; suspender una organización oculta todo sin borrar datos. El correo de contacto solo se ve con sesión.
- **Productos:** nacen en borrador y para publicarlos exigen al menos una etapa; el precio es opcional ("A cotizar"); destacar es solo del administrador; imágenes y sitios web solo `http(s)`.

### Procesos y Redes Transversales

- **Procesos** (`/plants/:slug/processes`): mapa por grupos de etapas habilitadas y lista; por etapa muestra activos por estado, los que requieren atención, críticos y OT abiertas (esto último solo con `maintenance.read`). El **flujo** (`stage_connections`) lo edita quien tiene `plant.configure`: el flujo principal no admite ciclos, las recirculaciones se marcan como *retorno*.
- **Redes** (`/plants/:slug/networks`): solo las redes habilitadas, cada una con su dashboard (estado, criticidad, etapas, activos con atención, OT).
- **Visibilidad:** los visitantes solo ven etapas/redes públicas, y los conteos incluyen únicamente activos públicos y solo si la planta publica sus activos; si no, se informa "no publicados" (distinto de cero).

### Cursos (LMS) (`/courses`)

- **Catálogo público** con filtros por etapa, nivel, quién lo ofrece, duración y certificado. Solo cursos **publicados** de organizaciones **activas**; el temario es público, pero el **contenido de las lecciones** exige inscripción (o gestionar el curso).
- **Quién publica:** el ecosistema (administrador), o un proveedor/contratista (sus miembros). Un curso nace en borrador; para publicarlo necesita al menos una lección y una etapa. La **duración** es la suma de las lecciones (no se edita a mano) y las posiciones siempre son consecutivas.
- **Contenido seguro:** las lecciones son texto plano (nunca HTML) y el video es un enlace externo `http(s)` que se abre en otra pestaña (no se incrusta).
- **Aprendizaje:** inscripción personal, avance por lección, finalización automática y **certificado verificable** (código `FUR-C-…`, página pública `/certificates/:código` que solo muestra titular, curso, emisor y fecha). Un curso completado no se deshace ni se abandona; abandonar conserva el avance; un curso archivado sigue disponible para quien ya lo estudia.
- **Integridad:** una inscripción por persona y curso; clics simultáneos no duplican certificados (bloqueo de fila); no se borra una lección que alguien completó ni se deja un curso publicado sin lecciones.
- **Precio:** el facilitador (quien gestiona el curso) fija `price` y `currency`; `0` = gratuito. Las tarjetas y el detalle lo exponen; el catálogo filtra con `?free=1|0` y ordena con `sort=price_asc|price_desc`. Es informativo: no hay cobro.
- **Fuera de alcance por ahora:** evaluaciones/exámenes con calificación, pagos y cursos por planta.

### Presupuestos (LULO) (`/plants/:slug/budgets`)

- **Interno:** nada es público. Lee `budget.read`, edita `budget.edit` y **aprueba** `budget.approve` (administrador de planta y gerente; el rol *Presupuestos* edita pero no aprueba). Sin `budget.read` la pantalla lo explica y no se piden datos.
- **Modelo:** libro de **recursos** con precio (material, mano de obra, equipo, transporte; se puede importar el costo desde inventario) → **APU** (análisis de precio unitario) → **presupuesto** con capítulos y partidas que apuntan a un APU. Los precios en otra moneda se convierten con el tipo de cambio de la planta; si falta, el APU/partida queda "sin precio" y el total, marcado como incompleto (nunca se inventa un cero).
- **Cálculo:** material y transporte = cantidad × (1 + desperdicio %) × precio; mano de obra y equipo = cuadrilla × horas por jornada ÷ rendimiento × precio horario. Gastos generales y utilidad se aplican sobre el costo directo; el impuesto, sobre el subtotal. Redondeo a 4 decimales por línea/APU y a 2 en importes y totales.
- **Flujo:** *Borrador* (precios vigentes, editable) → *Aprobado* (precios y desglose **congelados**, estructura inmutable; quien lo creó no lo aprueba, salvo el administrador del ecosistema) → *Cerrado*. *Duplicar* crea un borrador nuevo para cambiar un presupuesto ya aprobado.
- **Escenarios y sensibilidad:** ajuste % por tipo de recurso (p. ej. materiales +10 %) y tabla ±10 % por tipo, ordenada por impacto. **Desviaciones:** precio vigente hoy frente al congelado al aprobar, con su impacto en directo y total.
- **Valorizaciones:** solo sobre presupuestos aprobados; cantidad ejecutada por partida y periodo, con tope en lo contratado (acumulado de las aprobadas). Una valorización aprobada no se modifica y la aprobación se revalida bajo bloqueo de fila. El avance es lo valorizado sobre el costo directo aprobado.
- **Fuera de alcance por ahora:** versiones/comparación de presupuestos, importación Excel, órdenes de cambio y vínculo automático con compras reales.

### Dashboards y KPIs

- **Tablero de planta** (`/plants/:slug/dashboard`): *Resumen operacional* (activos y los que requieren atención, OT abiertas/vencidas, valor del inventario y bajo mínimo, requisiciones por aprobar, presupuesto aprobado y avance) y *Alertas*. Cada bloque se pide **solo si tienes el permiso del módulo** (`maintenance.read`, `inventory.read`, `procurement.read`, `budget.read`) y falla por separado: un módulo caído no tumba el tablero y lo que no puedes ver no se muestra ni se cuenta como cero.
- **Alertas** derivadas de esos indicadores, con gravedad en texto (*Crítica / Atención / Informativa*) y enlace al detalle ya filtrado: OT vencidas, repuestos críticos o ítems bajo mínimo, activos que requieren atención, precios vigentes por encima de lo congelado en presupuestos aprobados, requisiciones por aprobar y pedidos por recibir.
- **Dashboard del ecosistema** (`/dashboards`, con el contexto en *Ecosistema global*; API `GET /admin/dashboard`, solo administrador del ecosistema): plantas por estado y visibilidad, usuarios, roles/permisos/asignaciones, catálogos, etapas y redes maestras, proveedores y contratistas (con los **pendientes de aprobación** como alerta), cursos publicados, auditoría (24 h / 7 días y actividad reciente) y salud de la base de datos. El resto de personas ve **Mi panel** (plantas visibles con su rol y accesos al marketplace, proveedores, servicios, cursos y catálogo).
- **Honestidad de datos:** *Disponibilidad* (y MTBF) y las *integraciones* se muestran como "—" con su motivo hasta que existan fallas/paros e integraciones externas; nunca un cero inventado.
- **Fuera de alcance por ahora:** telemetría y producción/energía/calidad en tiempo real (fases 3–4), dashboards de proveedor/contratista agregados (cada organización ya tiene el suyo en su pantalla de gestión), alertas por correo o push.

### Bases de datos locales

| Base | Uso |
|---|---|
| `fur_dev` | desarrollo (`DATABASE_URL`) |
| `fur_test` | pruebas automáticas; se migra y siembra sola. Las pruebas **se niegan a correr** contra cualquier base que no termine en `_test` |

### Pruebas

```bash
npm test            # API + web      (requiere `npm run db:local` activo)
npm run test:api    # Jest: unitarias + e2e contra fur_test
npm run test:web    # Vitest
npm run check       # lint + pruebas + build: ejecútalo antes de publicar
```

### Esquema de base de datos

Editar `apps/api/src/database/schema/*.ts` → `npm run db:generate` → `npm run db:migrate`.
Las migraciones SQL (`apps/api/drizzle/`) se versionan.

### Componentes shadcn

```bash
cd apps/web && npx shadcn@latest add <componente>
```

Tokens de diseño en `apps/web/src/styles/tokens.css` (navy = identidad, gold = CTA/selección).

## Publicar (cuando todo esté listo)

Nada de esto es necesario para desarrollar. [render.yaml](render.yaml) define la API (web service) y el frontend (sitio estático) para Render.

1. Crear un proyecto en [Neon](https://neon.tech) y copiar las cadenas de conexión:
   `DATABASE_URL` → con pooler (host `…-pooler…`) · `DATABASE_URL_UNPOOLED` → directa (migraciones).
2. Subir el repo a GitHub y en Render: **New > Blueprint** > elegir el repo.
3. Completar `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `CORS_ORIGINS` (URL de `fur-web`) y `VITE_API_URL` (URL de `fur-api` + `/api/v1`).
4. La API aplica migraciones en cada arranque. El seed se corre una vez:
   `DATABASE_URL=<neon-directa> npm run db:seed`.

> **Documentos:** el disco de Render es efímero (los archivos subidos se pierden en cada deploy). Para publicar necesitas un disco persistente (plan de pago) o el driver S3 pendiente; hasta entonces, la base de datos conservaría los metadatos pero no los archivos.

> Plan gratuito: Render duerme el servicio por inactividad y Neon suspende el compute; la primera petición tras un rato puede tardar varios segundos.

## Estructura

```
apps/web    Frontend React
apps/api    API NestJS (src/modules/*, src/database/*, drizzle/ migraciones, test/ e2e)
scripts     Postgres local embebido
docs        Diseño y arquitectura
```
