import { Outlet } from 'react-router-dom'
import { AppHeader } from './app-header'
import { AppFooter } from './app-footer'

export function AppLayout() {
  return (
    <div className="app-shell min-h-svh bg-background">
      <AppHeader />
      <main id="main-content" className="app-main">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  )
}
