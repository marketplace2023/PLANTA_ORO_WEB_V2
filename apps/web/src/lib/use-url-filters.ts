import { useSearchParams } from 'react-router-dom'

/**
 * Filtros de un listado que viven en la URL (design.md §13): se pueden compartir y sobreviven a recargar.
 * `reserved` son parámetros que no son filtros (p. ej. la pestaña o el panel abierto).
 */
export function useUrlFilters(reserved: string[] = []) {
  const [params, setParams] = useSearchParams()
  const filters: Record<string, string | undefined> = Object.fromEntries([...params.entries()].filter(([k, v]) => v !== '' && !reserved.includes(k)))

  /** Cambia filtros y vuelve a la primera página (salvo `keepPage`, p. ej. al abrir un panel o paginar). */
  const setParam = (updates: Record<string, string | undefined>, keepPage = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(updates)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!keepPage) next.delete('page')
        return next
      },
      { replace: true },
    )

  return { params, filters, setParam }
}
