import { validateEnv } from './env'

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
  }

  it('aplica valores por defecto', () => {
    expect(validateEnv(base)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: base.DATABASE_URL,
      CORS_ORIGINS: ['http://localhost:5173'],
      JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      COOKIE_SAMESITE: 'lax',
      AUTH_RATE_LIMIT_PER_MINUTE: 10,
      STORAGE_DIR: './.local/storage',
      MAX_UPLOAD_MB: 25,
    })
  })

  it('separa CORS_ORIGINS por coma y quita barras finales', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'https://a.com/, https://b.com ,' })
    expect(env.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com'])
  })

  it('exige DATABASE_URL de postgres', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/DATABASE_URL/)
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/)
  })

  it('exige un JWT_ACCESS_SECRET de al menos 32 caracteres', () => {
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_ACCESS_SECRET/)
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'corto' })).toThrow(/JWT_ACCESS_SECRET/)
  })

  it('rechaza PORT y NODE_ENV inválidos y reporta todos los errores', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc', NODE_ENV: 'staging' })).toThrow(/PORT[\s\S]*NODE_ENV/)
    expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(/PORT/)
  })

  it('valida el almacenamiento de documentos', () => {
    expect(validateEnv({ ...base, STORAGE_DIR: '/data/docs', MAX_UPLOAD_MB: '50' })).toMatchObject({ STORAGE_DIR: '/data/docs', MAX_UPLOAD_MB: 50 })
    expect(() => validateEnv({ ...base, MAX_UPLOAD_MB: '0' })).toThrow(/MAX_UPLOAD_MB/)
    expect(() => validateEnv({ ...base, MAX_UPLOAD_MB: '500' })).toThrow(/MAX_UPLOAD_MB/)
  })

  it('valida COOKIE_SAMESITE y los límites numéricos', () => {
    expect(validateEnv({ ...base, COOKIE_SAMESITE: 'none' }).COOKIE_SAMESITE).toBe('none')
    expect(() => validateEnv({ ...base, COOKIE_SAMESITE: 'whatever' })).toThrow(/COOKIE_SAMESITE/)
    expect(() => validateEnv({ ...base, ACCESS_TOKEN_TTL_SECONDS: '5' })).toThrow(/ACCESS_TOKEN_TTL_SECONDS/)
    expect(() => validateEnv({ ...base, AUTH_RATE_LIMIT_PER_MINUTE: '0' })).toThrow(/AUTH_RATE_LIMIT_PER_MINUTE/)
  })
})
