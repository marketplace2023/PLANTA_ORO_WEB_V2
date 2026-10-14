import { Link, Outlet } from 'react-router-dom'

/**
 * Marco de las pantallas de acceso (iniciar sesión, crear cuenta): una vista sola, sin la barra de navegación ni el
 * buscador del ecosistema. Solo la marca, que lleva al inicio, y el formulario centrado.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="px-4 py-5 md:px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-fur-navy-900" aria-label="Ecosistema FUR — inicio">
          <span className="grid size-9 place-items-center rounded-md bg-fur-gold-500 font-mono text-sm font-bold text-fur-navy-900">FUR</span>
          <span className="text-base font-bold tracking-tight">Ecosistema FUR</span>
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
        <Outlet />
      </main>
    </div>
  )
}
