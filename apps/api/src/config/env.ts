export type Env = {
  NODE_ENV: 'development' | 'production' | 'test'
  PORT: number
  DATABASE_URL: string
  CORS_ORIGINS: string[]
  JWT_ACCESS_SECRET: string
  ACCESS_TOKEN_TTL_SECONDS: number
  REFRESH_TOKEN_TTL_DAYS: number
  /** `lax` si web y API comparten sitio (local); `none` si están en dominios distintos (Render). */
  COOKIE_SAMESITE: 'lax' | 'strict' | 'none'
  /** Intentos por minuto y por IP en /auth/*. */
  AUTH_RATE_LIMIT_PER_MINUTE: number
  /** Driver de almacenamiento de objetos: carpeta local (desarrollo) o bucket S3 (AWS). */
  STORAGE_DRIVER: 'local' | 's3'
  /** Carpeta del driver `local`. */
  STORAGE_DIR: string
  /** Bucket del driver `s3` (obligatorio con `STORAGE_DRIVER=s3`). Las credenciales salen del rol IAM del servicio. */
  S3_BUCKET: string
  /** Región del bucket; vacío = la del entorno (`AWS_REGION`). */
  S3_REGION: string
  MAX_UPLOAD_MB: number
  /** Proxies de confianza delante de la API (Render: 1; CloudFront + App Runner: 2). Define qué IP es `req.ip`. */
  TRUST_PROXY_HOPS: number
}

function intVar(raw: unknown, fallback: number, name: string, min: number, errors: string[]): number {
  const value = Number(raw ?? fallback)
  if (!Number.isInteger(value) || value < min) errors.push(`${name} debe ser un entero >= ${min}`)
  return value
}

/** Valida las variables de entorno al arrancar: falla rápido si falta algo crítico. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const errors: string[] = []

  const databaseUrl = String(raw.DATABASE_URL ?? '').trim()
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('DATABASE_URL debe ser una URL postgresql:// (cadena de conexión de Neon)')
  }

  const port = Number(raw.PORT ?? 3000)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push('PORT debe ser un entero entre 1 y 65535')
  }

  const nodeEnv = String(raw.NODE_ENV ?? 'development')
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push('NODE_ENV debe ser development, production o test')
  }

  const jwtSecret = String(raw.JWT_ACCESS_SECRET ?? '')
  if (jwtSecret.length < 32) {
    errors.push('JWT_ACCESS_SECRET debe tener al menos 32 caracteres (genera uno con: openssl rand -base64 48)')
  }

  const sameSite = String(raw.COOKIE_SAMESITE ?? 'lax')
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    errors.push('COOKIE_SAMESITE debe ser lax, strict o none')
  }

  const storageDriver = String(raw.STORAGE_DRIVER ?? 'local')
  if (!['local', 's3'].includes(storageDriver)) {
    errors.push('STORAGE_DRIVER debe ser local o s3')
  }
  const s3Bucket = String(raw.S3_BUCKET ?? '').trim()
  if (storageDriver === 's3' && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(s3Bucket)) {
    errors.push('S3_BUCKET debe ser el nombre de un bucket válido cuando STORAGE_DRIVER=s3')
  }

  const accessTtl = intVar(raw.ACCESS_TOKEN_TTL_SECONDS, 900, 'ACCESS_TOKEN_TTL_SECONDS', 30, errors)
  const refreshDays = intVar(raw.REFRESH_TOKEN_TTL_DAYS, 30, 'REFRESH_TOKEN_TTL_DAYS', 1, errors)
  const authRate = intVar(raw.AUTH_RATE_LIMIT_PER_MINUTE, 10, 'AUTH_RATE_LIMIT_PER_MINUTE', 1, errors)

  const trustProxyHops = intVar(raw.TRUST_PROXY_HOPS, 1, 'TRUST_PROXY_HOPS', 0, errors)
  if (trustProxyHops > 5) errors.push('TRUST_PROXY_HOPS no puede superar 5')

  const maxUploadMb = intVar(raw.MAX_UPLOAD_MB, 25, 'MAX_UPLOAD_MB', 1, errors)
  if (maxUploadMb > 200) errors.push('MAX_UPLOAD_MB no puede superar 200')

  if (errors.length > 0) {
    throw new Error(`Configuración inválida:\n - ${errors.join('\n - ')}`)
  }

  return {
    NODE_ENV: nodeEnv as Env['NODE_ENV'],
    PORT: port,
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: String(raw.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    JWT_ACCESS_SECRET: jwtSecret,
    ACCESS_TOKEN_TTL_SECONDS: accessTtl,
    REFRESH_TOKEN_TTL_DAYS: refreshDays,
    COOKIE_SAMESITE: sameSite as Env['COOKIE_SAMESITE'],
    AUTH_RATE_LIMIT_PER_MINUTE: authRate,
    STORAGE_DRIVER: storageDriver as Env['STORAGE_DRIVER'],
    S3_BUCKET: s3Bucket,
    S3_REGION: String(raw.S3_REGION ?? raw.AWS_REGION ?? '').trim(),
    STORAGE_DIR: String(raw.STORAGE_DIR ?? './.local/storage').trim() || './.local/storage',
    MAX_UPLOAD_MB: maxUploadMb,
    TRUST_PROXY_HOPS: trustProxyHops,
  }
}
