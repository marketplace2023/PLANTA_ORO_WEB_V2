import os from 'node:os'
import path from 'node:path'
import { assertTestDatabase, TEST_DATABASE_URL } from './test-url'

// Cada worker de Jest usa la base de pruebas, ignorando el .env de desarrollo.
assertTestDatabase(TEST_DATABASE_URL)
process.env.DATABASE_URL = TEST_DATABASE_URL
delete process.env.DATABASE_URL_UNPOOLED
process.env.NODE_ENV = 'test'
process.env.CORS_ORIGINS = 'http://localhost:5173'
process.env.JWT_ACCESS_SECRET = 'test-only-secret-0123456789abcdef0123456789abcdef'
process.env.COOKIE_SAMESITE = 'lax'
// Alto por defecto para no estorbar a los e2e; el test de rate limit lo baja explícitamente.
process.env.AUTH_RATE_LIMIT_PER_MINUTE = '1000'
// Documentos: carpeta temporal propia de las pruebas y tope pequeño para probar el límite de tamaño.
process.env.STORAGE_DIR = path.join(os.tmpdir(), 'fur-e2e-storage')
process.env.MAX_UPLOAD_MB = '1'
