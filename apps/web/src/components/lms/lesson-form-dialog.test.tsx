import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LessonFormDialog } from './lesson-form-dialog'

const calls = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), upload: vi.fn(), remove: vi.fn() }))
vi.mock('@/features/lms/use-lms', () => ({
  useAddLesson: () => ({ mutateAsync: calls.add }), useUpdateLesson: () => ({ mutateAsync: calls.update }),
  useUploadLessonVideo: () => ({ mutateAsync: calls.upload }), useRemoveLessonVideo: () => ({ mutateAsync: calls.remove }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('Lesson video form', () => {
  it('retries a failed upload on the saved lesson without creating a duplicate', async () => {
    const close = vi.fn()
    calls.add.mockResolvedValue({ createdLessonId: 'saved-lesson' })
    calls.update.mockResolvedValue({})
    calls.upload.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce({})
    render(<LessonFormDialog courseId="course" onClose={close} />)
    await userEvent.type(screen.getByLabelText('Título'), 'Molienda')
    await userEvent.click(screen.getByRole('radio', { name: 'Subir archivo' }))
    const file = new File(['video'], 'plant.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByLabelText('Archivo de video'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar lección' }))
    expect(await screen.findByText(/Connection interrupted/)).toBeInTheDocument()
    expect(close).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Agregar lección' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(calls.add).toHaveBeenCalledOnce()
    expect(calls.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'saved-lesson' }))
    expect(calls.upload).toHaveBeenCalledTimes(2)
    expect(calls.upload).toHaveBeenLastCalledWith(expect.objectContaining({ lessonId: 'saved-lesson', file }))
  })

  it('requires a file before creating an uploaded-video lesson', async () => {
    render(<LessonFormDialog courseId="course" onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Título'), 'Molienda')
    await userEvent.click(screen.getByRole('radio', { name: 'Subir archivo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar lección' }))
    expect(await screen.findByText('Selecciona un archivo de video')).toBeInTheDocument()
    expect(calls.add).not.toHaveBeenCalled()
  })
})
