import { Outlet } from 'react-router-dom'
import { AppHeader } from './app-header'

export function AppLayout() {
  return (
    <div className="min-h-svh bg-background">
      <AppHeader />
      <main className="mx-auto max-w-fur px-4 py-6 md:px-5 lg:px-6">
        <Outlet />
      </main>
    </div>
  )
}
