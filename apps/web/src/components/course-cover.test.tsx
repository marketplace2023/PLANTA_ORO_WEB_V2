import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBlob } from '@/lib/api'
import { CourseCover } from './course-cover'

vi.mock('@/lib/api', () => ({apiBlob:vi.fn()}))
afterEach(() => vi.restoreAllMocks())

describe('Course covers', () => {
  it('replaces failed remote images with an explanation and recovers for a new source', () => {
    const {rerender} = render(<CourseCover src="https://example.com/blocked.jpg" showError />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Sube un archivo')
    rerender(<CourseCover src="https://example.com/available.jpg" showError />)
    expect(screen.getByRole('img')).toHaveAttribute('src','https://example.com/available.jpg')
  })

  it('loads uploaded covers through the authenticated API and releases object URLs', async () => {
    const path = '/courses/018f0000-0000-7000-8000-000000000000/cover?v=123'
    vi.mocked(apiBlob).mockResolvedValue(new Blob(['image'],{type:'image/png'}))
    vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:cover-test')
    const revoke = vi.spyOn(URL,'revokeObjectURL')
    const {unmount} = render(<CourseCover src={path} />)
    await waitFor(()=>expect(screen.getByRole('img')).toHaveAttribute('src','blob:cover-test'))
    expect(apiBlob).toHaveBeenCalledWith(path,{signal:expect.any(AbortSignal)})
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:cover-test')
  })
})
