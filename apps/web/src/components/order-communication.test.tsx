import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { OrderCommunication } from './order-communication'

afterEach(() => vi.unstubAllGlobals())
describe('Order conversation and mediation', () => {
  it('sends the buyer message and lets the buyer escalate a seller decision', async () => {
    const m = mockApi({
      'GET /marketplace/orders/order/messages': { body: [] },
      'GET /marketplace/orders/order/cases': { body: [{ id: 'case', orderId: 'order', kind: 'DISPUTE', subject: 'Entrega pendiente', description: 'La entrega no coincide con lo acordado.', status: 'REJECTED', resolution: 'Rechazada por tienda' }] },
      'POST /marketplace/orders/order/messages': { status: 201, body: [] },
      'PATCH /marketplace/orders/order/cases/case': { body: { saved: true } },
    })
    renderWithProviders(<OrderCommunication id="order" seller={false} />)
    await userEvent.type(screen.getByLabelText('Mensaje'), 'Necesito confirmar las dimensiones')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
    await waitFor(() => expect(m.count('POST /marketplace/orders/order/messages')).toBe(1))
    expect(JSON.parse(m.calls.find(c => c.method === 'POST')!.init.body as string)).toEqual({ body: 'Necesito confirmar las dimensiones' })
    await userEvent.click(screen.getByText(/Incidencias y garantías/))
    await userEvent.type(await screen.findByLabelText('Respuesta o motivo'), 'Solicito revisión de las pruebas')
    await userEvent.click(screen.getByRole('button', { name: 'Solicitar mediación' }))
    await waitFor(() => expect(m.count('PATCH /marketplace/orders/order/cases/case')).toBe(1))
    expect(JSON.parse(m.calls.find(c => c.method === 'PATCH')!.init.body as string)).toMatchObject({ status: 'ESCALATED' })
  })
})
