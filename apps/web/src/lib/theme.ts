import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
const preferenceKey = 'fur-color-mode'
const changeEvent = 'fur-theme-change'
let currentTheme: Theme = 'light'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

function readPreference(): Theme | null {
  // Cookies share the preference between local portals on different ports.
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${preferenceKey}=`))?.split('=')[1]
  if (isTheme(cookie)) return cookie
  try {
    const saved = localStorage.getItem(preferenceKey)
    return isTheme(saved) ? saved : null
  } catch {
    return null
  }
}

function applyTheme(theme: Theme) {
  currentTheme = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d1727' : '#ffd21c')
  window.dispatchEvent(new Event(changeEvent))
}

export function setTheme(theme: Theme) {
  // The button still works if the browser blocks preference storage.
  try {
    localStorage.setItem(preferenceKey, theme)
  } catch { /* Private browsing may restrict storage. */ }
  document.cookie = `${preferenceKey}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  applyTheme(theme)
}

export function initializeTheme() {
  const system = window.matchMedia('(prefers-color-scheme: dark)')
  const synchronize = () => applyTheme(readPreference() ?? (system.matches ? 'dark' : 'light'))
  const onStorage = (event: StorageEvent) => {
    if (event.key === preferenceKey || event.key === null) synchronize()
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible') synchronize()
  }
  synchronize()
  system.addEventListener('change', synchronize)
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', synchronize)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    system.removeEventListener('change', synchronize)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', synchronize)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener)
  return () => window.removeEventListener(changeEvent, listener)
}

export function useTheme() {
  return useSyncExternalStore(subscribe, () => currentTheme, () => 'light' as Theme)
}
