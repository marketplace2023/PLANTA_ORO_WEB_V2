import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render';
import { mockApi } from '@/test/fetch-mock';
import { ProfessionalsStudioPage, ProfessionalServicePage } from './professionals-studio-page';
const auth = vi.hoisted(() => ({ user: { id: 'buyer-1' } as { id: string } | null }));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/features/catalog/use-catalog', () => ({ useStageCatalog: () => ({ data: [] }) }));
const item = { id: 'service-1', name: 'Diagnóstico industrial', description: 'Servicio con informe completo.', specialty: 'MECANICA', version: 2, currency: 'USD', mode: 'FIXED', fromPrice: 120, deliveryDays: 7, coverUrl: '/professional-market/media/image-1', rating: 4.5, ratingCount: 2, contractor: { id: 'contractor-1', name: 'Especialistas industriales', verified: true, availability: 'AVAILABLE', city: 'Caracas', countryCode: 'VE' } };
afterEach(() => { vi.unstubAllGlobals(); auth.user = { id: 'buyer-1' }; });
function offerDetail(mode: 'FIXED' | 'QUOTE' = 'FIXED', canContract = true) {
    return { ...item, mode, status: 'PUBLISHED', stageCodes: [], canManage: !canContract, canContract,
        packages: [{ id: 'basic', name: 'Esencial', description: 'Inspección del equipo', price: 0, deliveryDays: 7, revisions: 1, deliverables: ['Informe'] }],
        extras: [], requirements: [], faq: [], terms: '', videoUrl: '', gallery: [], reviews: [],
        contractor: { ...item.contractor, displayName: 'Especialista', headline: '', bio: '', languages: [], skills: [], portfolio: [], avatarUrl: null, portfolioImages: [], certifications: [] } };
}
function openDetail() {
    renderWithProviders(<Routes><Route path="/professionals/:id" element={<ProfessionalServicePage />} /><Route path="/service-orders/:id" element={<p>Solicitud registrada</p>} /></Routes>, { route: '/professionals/service-1' });
}
describe('Public professional services', () => {
    it('explains why company members cannot hire their own service', async () => {
        const mock = mockApi({ 'GET /professional-market/services/service-1': { body: offerDetail('FIXED', false) } });
        openDetail();
        expect(await screen.findByRole('note')).toHaveTextContent('Estás viendo un servicio de tu empresa');
        expect(screen.getByRole('link', { name: /Gestionar en el portal profesional/ })).toHaveAttribute('href', 'http://localhost:5179/services/service-1');
        expect(screen.queryByRole('button', { name: 'Contratar este paquete' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Solicitar cotización' })).not.toBeInTheDocument();
        expect(mock.count('POST /professional-market/orders')).toBe(0);
    });

    it('sends a custom quote request without package price or extras', async () => {
        const mock = mockApi({ 'GET /professional-market/services/service-1': { body: offerDetail('QUOTE') }, 'POST /professional-market/orders': { status: 201, body: { id: 'quote-1' } } });
        openDetail();
        fireEvent.click(await screen.findByRole('button', { name: 'Solicitar cotización' }));
        expect(screen.getByText('Precio a convenir')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Contratar este paquete' })).not.toBeInTheDocument();
        expect(screen.getByText(/Enviar esta solicitud no genera un cobro/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Describe tu proyecto'), { target: { value: 'Necesito una evaluación y cotización del mantenimiento.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
        expect(await screen.findByText('Solicitud registrada')).toBeInTheDocument();
        const payload = JSON.parse(mock.calls.find(c => c.method === 'POST')!.init.body as string);
        expect(payload).toMatchObject({ serviceId: 'service-1', mode: 'QUOTE', expectedVersion: 2 });
        expect(payload).not.toHaveProperty('packageId');
        expect(payload).not.toHaveProperty('expectedTotal');
        expect(payload).not.toHaveProperty('extras');
    });

    it('allows requesting a custom proposal for a fixed package service', async () => {
        const mock = mockApi({ 'GET /professional-market/services/service-1': { body: offerDetail() }, 'POST /professional-market/orders': { status: 201, body: { id: 'custom-1' } } });
        openDetail();
        fireEvent.click(await screen.findByRole('button', { name: 'Necesito una propuesta personalizada' }));
        fireEvent.change(screen.getByLabelText('Describe tu proyecto'), { target: { value: 'Quiero incluir dos equipos en una propuesta especial.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
        await screen.findByText('Solicitud registrada');
        expect(JSON.parse(mock.calls.find(c => c.method === 'POST')!.init.body as string).mode).toBe('QUOTE');
    });

    it('provides a sign-in link to anonymous customers instead of a disabled submission', async () => {
        auth.user = null;
        mockApi({ 'GET /professional-market/services/service-1': { body: offerDetail('QUOTE') } });
        openDetail();
        expect(await screen.findByRole('link', { name: 'Iniciar sesión para cotizar' })).toHaveAttribute('href', '/login');
        expect(screen.queryByRole('button', { name: 'Enviar solicitud' })).not.toBeInTheDocument();
    });
    it('shows compact cards linking to the complete offer and verified reviews', async () => {
        mockApi({ 'GET /professional-market/services': { body: { items: [item], total: 1, page: 1, pageSize: 12 } } });
        renderWithProviders(<ProfessionalsStudioPage />);
        const link = await screen.findByRole('link', { name: /Diagnóstico industrial/ });
        expect(link).toHaveAttribute('href', '/professionals/service-1');
        expect(screen.getByText('4.5 (2)', { exact: false })).toBeDefined();
    });
    it('creates an order from the selected package, extras and client requirements', async () => {
        const detail = { ...item, status: 'PUBLISHED', stageCodes: [], canManage: true, canContract: true, packages: [{ id: 'basic', name: 'Esencial', description: 'Inspección del equipo', price: 120, deliveryDays: 7, revisions: 1, deliverables: ['Informe'] }], extras: [{ id: 'extra', name: 'Equipo adicional', price: 5, extraDays: 1 }], requirements: [{ id: 'equipment', question: 'Equipo a inspeccionar', required: true }], faq: [], terms: 'Acceso a la planta', videoUrl: '', gallery: [{ id: 'image-1', url: '/professional-market/media/image-1', name: 'Foto del servicio' }], reviews: [], contractor: { ...item.contractor, displayName: 'Especialista', headline: 'Ingeniería mecánica', bio: 'Profesional de mantenimiento', languages: ['Español'], skills: ['Diagnóstico'], portfolio: [], avatarUrl: null, portfolioImages: [], certifications: [] } };
        const m = mockApi({ 'GET /professional-market/services/service-1': { body: detail }, 'POST /professional-market/orders': { status: 201, body: { id: 'new-order' } } });
        renderWithProviders(<Routes><Route path="/professionals/:id" element={<ProfessionalServicePage />}/><Route path="/service-orders/:id" element={<p>Trabajo creado</p>}/></Routes>, { route: '/professionals/service-1' });
        fireEvent.click(await screen.findByRole('button', { name: 'Contratar este paquete' }));
        fireEvent.click(screen.getByLabelText(/Equipo adicional/));
        fireEvent.change(screen.getByLabelText('Describe tu proyecto'), { target: { value: 'Necesito inspeccionar el equipo de molienda.' } });
        fireEvent.change(screen.getByLabelText(/Equipo a inspeccionar/), { target: { value: 'Molino principal' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar contratación' }));
        expect(await screen.findByText('Trabajo creado')).toBeInTheDocument();
        await waitFor(() => expect(m.count('POST /professional-market/orders')).toBe(1));
        const payload = JSON.parse(m.calls.find(c => c.method === 'POST')!.init.body as string);
        expect(payload).toMatchObject({ mode: 'FIXED', packageId: 'basic', extras: ['extra'], expectedTotal: 125, expectedVersion: 2, requirements: { equipment: 'Molino principal' } });
    });
});
