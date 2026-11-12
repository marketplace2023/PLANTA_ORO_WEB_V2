import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTheme, setTheme } from '@/lib/theme'
import { ThemeToggle } from './theme-toggle'

describe('ThemeToggle', () => {
  let stop: () => void
  let system: EventTarget & { matches: boolean }

  beforeEach(() => {
    localStorage.clear()
    document.cookie = 'fur-color-mode=; Path=/; Max-Age=0'
    system = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('matchMedia', vi.fn(() => system))
  })

  afterEach(() => {
    stop?.()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.documentElement.classList.remove('dark')
    delete document.documentElement.dataset.theme
    document.documentElement.style.colorScheme = ''
    document.cookie = 'fur-color-mode=; Path=/; Max-Age=0'
    localStorage.clear()
  })

  it('switches both ways with an accessible label and saves the choice', () => {
    stop = initializeTheme()
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Activar modo oscuro' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(localStorage.getItem('fur-color-mode')).toBe('dark')
    expect(document.cookie).toContain('fur-color-mode=dark')
    expect(screen.getByRole('button', { name: 'Activar modo claro' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Activar modo claro' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('fur-color-mode')).toBe('light')
  })

  it('restores a saved preference before rendering the button', () => {
    localStorage.setItem('fur-color-mode', 'dark')
    stop = initializeTheme()
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Activar modo claro' })).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('dark')
  })

  it('follows the system until the user makes an explicit choice', () => {
    stop = initializeTheme()
    system.matches = true
    act(() => system.dispatchEvent(new Event('change')))
    expect(document.documentElement).toHaveClass('dark')
    act(() => setTheme('light'))
    act(() => system.dispatchEvent(new Event('change')))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('adopts the shared portal preference when the window regains focus', () => {
    localStorage.setItem('fur-color-mode', 'light')
    stop = initializeTheme()
    render(<ThemeToggle />)
    document.cookie = 'fur-color-mode=dark; Path=/'
    fireEvent.focus(window)
    expect(screen.getByRole('button', { name: 'Activar modo claro' })).toBeInTheDocument()
  })

  it('synchronizes storage changes from another tab', () => {
    stop = initializeTheme()
    render(<ThemeToggle />)
    localStorage.setItem('fur-color-mode', 'dark')
    fireEvent(window, new StorageEvent('storage', { key: 'fur-color-mode', newValue: 'dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByRole('button', { name: 'Activar modo claro' })).toBeInTheDocument()
  })

  it('keeps the switch usable when local storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
    stop = initializeTheme()
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Activar modo oscuro' }))
    expect(document.documentElement).toHaveClass('dark')
  })
})
