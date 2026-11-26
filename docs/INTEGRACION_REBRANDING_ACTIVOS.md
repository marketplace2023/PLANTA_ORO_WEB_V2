# Integración del rebranding con activos y solicitudes

Se integraron las ramas principales de API/web, planta y administración en `feature/planta-activos-refactor`. Se conservan el registro desde catálogo, las especificaciones por familia, los TAG permanentes y el circuito de solicitudes (notas, aprobación, rechazo y nuevas solicitudes basadas en una rechazada).

Las pantallas nuevas usan las superficies, radios y colores del rebranding. La bandeja de administración reutiliza `MagicSurface`; los estados de solicitud utilizan colores semánticos sobre las superficies del tema, incluyendo modo oscuro. Los formularios mantienen su distribución, límites de altura y desplazamiento interior.

## Historias de migraciones

Ambas ramas comparten las migraciones hasta `0036_reference_manufacturers`. Después generaron migraciones distintas con prefijos numéricos coincidentes. El registro combinado conserva todos los nombres completos, SQL y timestamps originales; sus índices son consecutivos y se ordena por timestamp. No se renumeran las identidades ya guardadas en bases existentes.

El ejecutor `src/database/migrate.ts` aplica las migraciones pendientes por identidad (hash o timestamp exacto), dentro de una transacción y con bloqueo de concurrencia. No usa el último timestamp como único criterio, porque una base procedente de cualquiera de las ramas puede tener migraciones faltantes anteriores a ese valor. Repetirlo no vuelve a ejecutar las ya registradas.

Usar `npm run db:migrate` o el ejecutor compilado de producción. No sustituirlo por `drizzle-kit migrate`, cuyo criterio basado en el último timestamp omitiría parte de la historia intercalada. Los snapshots de generación también se consolidan para representar el esquema completo.

La prueba `test/migration-histories.e2e.spec.ts` construye bases temporales con cada historia original, las actualiza con el registro combinado, verifica la conservación de datos e identidades y repite la actualización para comprobar su idempotencia. No requiere borrar datos locales ni resetear la base de trabajo.
