import { Moon, Sun } from 'lucide-react'
import { setTheme, useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const theme = useTheme()
  const label = theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'
  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      aria-pressed={theme === 'dark'}
      title={label}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
    </button>
  )
}
