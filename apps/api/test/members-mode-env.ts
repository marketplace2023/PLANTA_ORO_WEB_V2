// Se importa PRIMERO en las pruebas del modo normal: ConfigModule valida el entorno al cargar AppModule, así que
// ACCESS_MODE debe fijarse antes de importar nada que cargue la aplicación (test-env.ts lo deja en `open`).
process.env.ACCESS_MODE = 'members'
