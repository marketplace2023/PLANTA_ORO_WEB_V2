import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'

const loginSchema = z.object({
  email: z.string().trim().pipe(z.email('Ingresa un correo válido')),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

const registerSchema = loginSchema.extend({
  firstName: z.string().trim().min(1, 'Requerido'),
  lastName: z.string().trim().min(1, 'Requerido'),
  password: z.string().min(10, 'Mínimo 10 caracteres'),
})

type Errors = Record<string, string>

function describeError(err: unknown, mode: 'login' | 'register'): { form?: string; fields?: Errors } {
  if (!(err instanceof ApiError)) return { form: 'No se pudo conectar con el servidor. Inténtalo de nuevo.' }
  if (err.status === 429) return { form: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.' }
  if (err.status === 401) return { form: 'Correo o contraseña incorrectos.' }
  if (err.status === 409) return { fields: { email: 'Ya existe una cuenta con ese correo.' } }
  if (err.status === 400 && err.fieldErrors.length > 0) {
    return { fields: Object.fromEntries(err.fieldErrors.map((e) => [e.path, e.message])) }
  }
  return { form: mode === 'login' ? 'No se pudo iniciar sesión.' : 'No se pudo crear la cuenta.' }
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { status, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [values, setValues] = useState({ email: '', password: '', firstName: '', lastName: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated') return <Navigate to={from} replace />

  const isLogin = mode === 'login'
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(undefined)

    const parsed = (isLogin ? loginSchema : registerSchema).safeParse(values)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrors({})

    setSubmitting(true)
    try {
      if (isLogin) await login(parsed.data.email, values.password)
      else await register({ ...(parsed.data as z.infer<typeof registerSchema>) })
      navigate(from, { replace: true })
    } catch (err) {
      const { form, fields } = describeError(err, mode)
      setFormError(form)
      if (fields) setErrors(fields)
    } finally {
      setSubmitting(false)
    }
  }

  const field = (id: keyof typeof values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={values[id]}
        onChange={set(id)}
        aria-invalid={!!errors[id]}
        aria-describedby={errors[id] ? `${id}-error` : undefined}
        className="h-10"
        {...props}
      />
      {errors[id] && (
        <p id={`${id}-error`} className="text-sm text-fur-red-500">
          {errors[id]}
        </p>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-md pt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</CardTitle>
          <CardDescription>
            {isLogin
              ? 'Accede para ver tus plantas y trabajar según tu rol.'
              : 'Las cuentas nuevas son de solo lectura hasta que un administrador de planta te asigne un rol.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-3">
                {field('firstName', 'Nombre', { autoComplete: 'given-name' })}
                {field('lastName', 'Apellido', { autoComplete: 'family-name' })}
              </div>
            )}
            {field('email', 'Correo electrónico', { type: 'email', autoComplete: 'email', inputMode: 'email' })}
            {field('password', 'Contraseña', {
              type: 'password',
              autoComplete: isLogin ? 'current-password' : 'new-password',
            })}

            <div role="alert" aria-live="polite">
              {formError && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{formError}</p>}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? 'Un momento…' : isLogin ? 'Entrar' : 'Crear cuenta'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-fur-gray-600">
            {isLogin ? (
              <>
                ¿No tienes cuenta?{' '}
                <Link to="/register" state={location.state} className="font-semibold text-fur-navy-900 underline">
                  Regístrate
                </Link>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{' '}
                <Link to="/login" state={location.state} className="font-semibold text-fur-navy-900 underline">
                  Inicia sesión
                </Link>
              </>
            )}
          </p>

          {import.meta.env.DEV && isLogin && (
            <p className="mt-4 rounded-md bg-muted p-3 text-xs text-fur-gray-600">
              <strong>Demo local:</strong> admin@fur.local · gerente@fur.local · mantenimiento@fur.local · lector@fur.local
              <br />
              Contraseña: <span className="fur-code">fur-local-2026</span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
