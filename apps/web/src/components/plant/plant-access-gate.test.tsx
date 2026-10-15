import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { PlantAccessGate } from './plant-access-gate'

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: 'x', json: async () => body })

function stubApi(mine: unknown[] = []) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/plant-access-requests/mine')) return json(mine)
    if (url.endsWith('/plant-access-requests') && init?.method === 'POST') return json({ id: 'r1', status: 'PENDING', plantSlug: 'revemin-ii' }, 201)
    throw new Error(`ruta no simulada: ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('PlantAccessGate', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ofrece solicitar acceso a la planta sin mostrar datos', async () => {
    const fetchMock = stubApi()
    renderWithProviders(<PlantAccessGate plantName="REVEMIN II" plantSlug="revemin-ii" />)

    expect(screen.getByText('No perteneces a REVEMIN II')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Solicitar acceso' }))

    const post = fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/plant-access-requests') && init?.method === 'POST')
    expect(post).toBeTruthy()
    expect(JSON.parse(String(post![1]!.body))).toEqual({ plant: 'revemin-ii' })
  })

  it('con una solicitud pendiente lo dice y no vuelve a ofrecer pedirla', async () => {
    stubApi([{ id: 'r1', status: 'PENDING', plantSlug: 'revemin-ii', message: null, decisionNote: null, createdAt: '2026-10-14T00:00:00Z' }])
    renderWithProviders(<PlantAccessGate plantName="REVEMIN II" plantSlug="revemin-ii" />)

    expect(await screen.findByText('Solicitud de acceso pendiente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solicitar acceso' })).not.toBeInTheDocument()
  })
})
