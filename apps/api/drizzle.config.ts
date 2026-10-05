import { defineConfig } from 'drizzle-kit'

try {
  process.loadEnvFile('.env')
} catch {
  /* sin .env */
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  // Un único clúster con separación lógica por schemas (arquitectura §7).
  schemaFilter: ['iam', 'core', 'process', 'plant', 'audit', 'catalog', 'asset', 'document', 'maintenance', 'inventory', 'provider', 'marketplace', 'professional', 'procurement', 'lms', 'budget'],
  dbCredentials: {
    // Neon: usar la conexión directa (sin -pooler) para migraciones.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
})
