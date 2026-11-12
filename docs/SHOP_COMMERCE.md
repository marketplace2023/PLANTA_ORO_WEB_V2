# Tiendas y compras del marketplace

## Productos propios de cada tienda

La web principal tiene una única entrada **Marketplace**, con vistas de Productos y Vendedores y filtro de tipo de vendedor: todos, tiendas verificadas o particulares no verificados. La clasificación utiliza el campo `verified` administrado por el ecosistema; tener una cuenta habilitada para vender no concede el sello de tienda verificada.

La web principal permite consultar perfiles, comprar y seguir pedidos como comprador. El registro, la edición de productos y la gestión comercial se hacen exclusivamente desde el dashboard de vendedores. Las rutas antiguas `/providers` y `/providers/:id/manage` redirigen a la vista pública del marketplace y no muestran controles de gestión, incluso para administradores. Los datos existentes y sus verificaciones se conservan.

El portal de proveedores (`http://localhost:5177`) permite crear productos propios en **Mis productos → Nuevo producto**. No se selecciona ni crea un modelo del catálogo técnico. Se reutiliza la clasificación por familias y los tipos de datos NUMBER, RANGE, TEXT, LIST y BOOLEAN para describir el producto. Marca, modelo comercial, garantía, características, SKU, variantes, precios e inventario pertenecen a la tienda.

El editor tiene Información, Ficha técnica, Variantes e inventario, Imágenes y Publicación. Se puede guardar un borrador con información parcial; para publicar se completan las variantes. La portada admite una imagen y la galería hasta ocho imágenes adicionales, JPG/PNG/WebP de 5 MB por archivo. Las etapas son opcionales. Los enlaces históricos a modelos técnicos se conservan por compatibilidad; al guardar la ficha comercial del nuevo editor se desvincula el modelo, sin modificar el catálogo.

Cada SKU es único dentro de la tienda. El stock total, las reservas y los movimientos se guardan por variante. Reducir el stock por debajo de lo reservado se rechaza. Las variantes retiradas se desactivan, conservando su referencia en pedidos anteriores. El inventario comercial no modifica el WMS ni los activos físicos de una planta.

## Configuración de transferencias y entregas

El responsable de la tienda configura **Transferencias y entregas**: banco, beneficiario, cuenta, moneda, instrucciones, costo fijo de envío y cobertura. Los miembros pueden gestionar pedidos; solo el responsable o el administrador cambia la cuenta bancaria.

Los compradores reciben una copia de esas instrucciones en su pedido. La cuenta no se publica en la búsqueda de productos. Cambiar los datos de la tienda no cambia las instrucciones de pedidos anteriores. Los productos de una compra deben coincidir con la moneda configurada.

Sin zonas configuradas, la cobertura se describe por la tienda y se conserva el costo fijo. Con zonas, cada tarifa define país, ciudades opcionales, costo, plazo estimado y transportista. El comprador elige una zona y el servidor comprueba que coincida con el país y la ciudad de entrega, sin distinguir mayúsculas ni tildes. Una lista de ciudades vacía cubre todo el país indicado. La tarifa y el plazo quedan copiados en el pedido. El seguimiento se registra manualmente; no existe integración automática con transportistas.

## Mayoristas y promociones

En **Mis productos → Variantes e inventario**, cada variante admite una cantidad mínima, precios por tramos de cantidad y una promoción con porcentaje y fechas UTC. Se utiliza el tramo de mayor cantidad alcanzada y después se aplica el descuento vigente, redondeando el precio unitario a centavos. La promoción no altera precios de pedidos ya creados. El carrito muestra el precio para la cantidad elegida y la API lo recalcula al confirmar; cantidades inferiores al mínimo se rechazan también en el servidor.

## Compra directa

En la web principal: Marketplace → detalle del producto → variante y cantidad → carrito → confirmar datos de entrega y pedido → Mis pedidos. El carrito se separa por tienda, modalidad y moneda. Se vuelve a comprobar precio, publicación, tienda, variantes y stock en el servidor; si el precio cambió se pide actualizar el carrito.

Estados: **Pendiente de transferencia → Transferencia en revisión → Pago confirmado → En preparación → Enviado → Entregado**. El comprador informa la referencia y puede adjuntar un comprobante JPG/PNG/WebP de hasta 5 MB. La tienda debe comprobar el abono en su banco antes de confirmar el pago. La aplicación registra esa confirmación manual; no realiza ni valida transferencias bancarias.

Las existencias se reservan al crear el pedido. El envío descuenta el stock total y libera la reserva. La cancelación antes del pago confirmado libera las unidades. Los pedidos pendientes permanecen reservados hasta su envío o cancelación; no hay caducidad automática. Las transiciones dejan historial con actor y fecha. Los reintentos con la misma clave no duplican pedidos; una clave reutilizada con otro contenido se rechaza.

Después de informar una transferencia, el comprador no puede cancelar directamente. La tienda debe revisarla: puede devolverla a pendiente si no hubo abono, o confirmar el pago. Para cancelar desde revisión, la tienda debe registrar un motivo y confirmar que no recibió el dinero. Un pago confirmado puede pasar a solicitud de devolución/reembolso antes del envío; las reservas se liberan cuando la tienda confirma el reembolso.

## Cotización del marketplace

Un producto puede venderse **a cotizar**. El comprador solicita cantidades desde el carrito y la tienda cotiza cada línea en Pedidos y ventas. El comprador puede aceptar o solicitar una nueva propuesta explicando qué desea negociar. Cada propuesta incrementa su versión y solo se puede aceptar la versión vigente. Al aceptar se reservan existencias y se habilita el mismo flujo de transferencia. Antes de aceptar no se reserva stock. Las solicitudes por invitación de las plantas siguen disponibles en **Cotizaciones de planta** y conservan su flujo interno de compras.

## Conversaciones, avisos e incidencias

Cada pedido tiene una conversación privada para comprador, personal autorizado de la tienda y administración. Admite texto y un PDF o imagen JPG/PNG/WebP de hasta 5 MB por mensaje, validado por contenido. Los adjuntos exigen autorización y no se publican en el catálogo. Se muestran los últimos 200 mensajes. Los avisos internos registran mensajes, cambios de pedido e incidencias, con lectura individual; se consultan cada 15 segundos y no envían correos ni notificaciones externas.

El comprador abre incidencias de compra y, tras la entrega, solicitudes de garantía. La tienda puede revisarlas, resolverlas o rechazarlas. El comprador puede solicitar mediación, incluso si no acepta la respuesta de cierre de la tienda. Desde **Administración → Incidencias del marketplace**, el administrador consulta las pruebas y registra una resolución final. Una incidencia en mediación solo la resuelve administración. Cada respuesta queda en la conversación y notifica a la otra parte. Resolver una incidencia no ejecuta un reembolso ni repone inventario: se conserva el flujo explícito del pedido.

## Herramientas, reportes y equipo

**Herramientas y reportes** ofrece una plantilla Excel `.xlsx` exclusiva para productos propios de la tienda. Se conservan las hojas y encabezados de **Productos**, **Variantes**, **Especificaciones** e **Imagenes**. La referencia del producto une las hojas; no es un identificador de modelo del catálogo. Las categorías existentes se consultan en el desplegable de instrucciones de la pantalla.

Cada producto requiere al menos una variante con SKU único, una especificación técnica y exactamente una portada. Se aceptan hasta 200 productos, 100 variantes y 80 especificaciones por producto, con un máximo de 2.000 filas por hoja. Los números deben ser celdas numéricas; SKU y referencia deben ser texto para conservar ceros iniciales. Los tipos técnicos son NUMBER, TEXT, BOOLEAN, LIST y RANGE; los últimos tres utilizan valores JSON. Se rechazan fórmulas, macros, vínculos externos, hojas desconocidas y fotos incrustadas en el libro.

Las imágenes se adjuntan por separado y se relacionan mediante los nombres de archivo declarados en **Imagenes**. Se admite una portada y hasta ocho imágenes de galería por producto, con órdenes distintos de 0 a 7. Solo JPG, PNG y WebP, con contenido validado; cada archivo y el Excel admiten hasta 5 MB. El lote permite hasta 40 imágenes y 50 MB de fotos. Las imágenes faltantes, sin asignación, repetidas o inválidas bloquean la importación.

**Analizar archivos** no guarda productos ni fotos. La vista previa muestra variantes, precios, stock, conteos y errores por hoja y fila. La confirmación vincula la huella del Excel y las imágenes con el usuario, la tienda, las categorías y el estado comercial revisado. Si cambian, exige analizar de nuevo. Se comprueban permisos y se valida otra vez dentro de una transacción: se crean todos los productos como borradores o ninguno. Un fallo de almacenamiento revierte los registros y se intenta retirar los objetos nuevos. No se modifica el catálogo, sus modelos ni sus categorías. La ruta anterior JSON/CSV se conserva por compatibilidad, fuera del flujo principal de la pantalla.

Para productos existentes, **Portadas para productos existentes** relaciona `SKU.jpg`, `SKU.png` o `SKU.webp` con una variante de la tienda seleccionada. No busca en el catálogo técnico ni en otras tiendas. Bloquea SKU desconocidos y varias fotos destinadas a la misma portada. El reemplazo de portadas existentes requiere marcar la opción y repetir el análisis. La carga es atómica y detecta cambios desde la vista previa; las fotos anteriores se retiran solo después de guardar las nuevas. La galería también puede seguir gestionándose desde el editor de cada producto.

La plantilla se genera con `node scripts/generate-shop-import-template.cjs` desde el repositorio principal y se entrega en `planta_beneficio_oro_suppliers/public/templates/plantilla-productos-tienda.xlsx`. La API utiliza `read-excel-file` y `fflate` para validar el libro; no necesita cambios del esquema de base de datos.

Los reportes CSV incluyen los últimos 10.000 pedidos o variantes. Se protegen celdas que podrían interpretarse como fórmulas y se excluyen cuentas bancarias y contactos de compradores.

Solo el responsable o administrador asigna funciones a miembros: **Catálogo y productos**, **Ventas, atención y reportes**, **Pagos y reportes**, **Atención y garantías**, o **Solo consulta**. Los permisos se comprueban en la API, incluyendo las rutas anteriores de edición de productos. La cancelación de una transferencia en revisión requiere permiso financiero. Los responsables conservan acceso completo y la cuenta bancaria sigue reservada a responsables y administración. Los miembros sin función específica conservan sus permisos anteriores hasta que se les asigne una; quitar a una persona elimina también esa asignación.

## Devoluciones y reseñas

Después de la entrega, el comprador puede solicitar una devolución; la tienda la aprueba y registra la referencia después de transferir el reembolso. La aplicación no ejecuta el reembolso. Los productos devueltos no reponen automáticamente stock: la tienda registra el ajuste tras inspeccionarlos.

Las reseñas se admiten únicamente para productos de pedidos entregados del propio comprador, una por producto y pedido. Se muestran con la indicación de compra verificada. Son distintas de la calificación administrativa histórica del proveedor.

## Datos, operación y pruebas

`0042_shop_commerce.sql` agrega datos comerciales, variantes, galería, configuración, pedidos, líneas e historial. `0043_commerce_inventory_reviews.sql` agrega movimientos y reseñas. `0044_marketplace_business_tools.sql` agrega reglas de venta, zonas, versiones de cotización, conversaciones, avisos, incidencias y funciones del equipo. Son migraciones aditivas; no convierten texto de stock antiguo en existencias numéricas ni inventan datos bancarios, variantes o ventas.

La lista muestra los últimos 200 pedidos. Los indicadores del tablero agregan todos los pedidos y separan las monedas. No se suman distintas monedas ni se incluyen reembolsos confirmados como ventas cobradas.

Aplicar desde el repositorio principal:

```powershell
npm run db:migrate -w @fur/api
npm run build -w @fur/api
npm run build -w @fur/web
npm run test -w @fur/api -- --runInBand shop-commerce.e2e.spec.ts shop-business-tools.e2e.spec.ts commerce.schemas.spec.ts commerce-rules.spec.ts organizations.e2e.spec.ts
```

En proveedores: `npm run lint`, `npm test`, `npm run build`. Para la importación estricta: `npm run test -w @fur/api -- --runInBand shop-import.e2e.spec.ts`. Se usa el almacenamiento de archivos ya configurado en la API.
