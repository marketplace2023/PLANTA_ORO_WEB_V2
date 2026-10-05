/** Base de datos SOLO para pruebas. Nunca apunta a dev ni a la nube. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://fur:fur@localhost:54320/fur_test'

/** Salvaguarda: las pruebas insertan y borran datos, así que exigimos una base `*_test`. */
export function assertTestDatabase(url: string) {
  const dbName = new URL(url).pathname.replace(/^\//, '')
  if (!dbName.endsWith('_test')) {
    throw new Error(`Las pruebas solo pueden correr contra una base de datos "*_test" (recibido: "${dbName}")`)
  }
}
