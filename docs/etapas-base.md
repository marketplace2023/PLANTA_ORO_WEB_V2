# Etapas que se recuperan al inicializar la base

El seeder `apps/api/src/database/seed.ts` contiene las etapas base D01–D20. La etapa D20 se incluye como configuración permanente:

| Campo | Valor |
| --- | --- |
| Código | D20 |
| Nombre | Sala de control y monitoreo |
| Descripción | Sala de control y monitoreo |
| Grupo | SALA DE CONTROL Y MONITOREO |
| Color | cyan (Celeste) |
| Orden | 20 |

Se insertan por código con `onConflictDoNothing`: repetir el seed conserva el ID, las ediciones administrativas y los vínculos de una etapa existente. No sobrescribe D20 ni duplica su registro.

`npm run db:reset-local -- --yes` prepara la base nueva mediante migraciones y `runSeedDev`, que llama a este seeder. Por tanto, un futuro reinicio local recuperará D20 antes de importar los activos. No hace falta crearla manualmente otra vez. Este cambio no ejecuta un reinicio ni modifica las etapas actuales.

Si inicializas una base remota vacía, ejecuta las migraciones y luego `npm run db:seed` desde el repositorio de WEB/API con la conexión de destino configurada. El arranque `start:prod` aplica las migraciones, pero no ejecuta seeders. El seeder base no carga modelos ni activos de demostración.

Las demás etapas que se creen manualmente solo existen en esa base. Para que también se recuperen después de un reinicio completo, incorpora sus datos a este listado versionado. Los tipos, activos y vínculos cargados mediante Excel se recuperan al volver a importarlos; el seed de etapas no los recrea.
