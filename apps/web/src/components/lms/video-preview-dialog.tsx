import type { Lesson } from '@/features/lms/use-lms'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LessonVideo } from './lesson-video'

export function VideoPreviewDialog({ courseId, lesson, onClose }: { courseId: string; lesson: Lesson | null; onClose: () => void }) {
  if (!lesson) return null
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>{lesson.title}</DialogTitle><DialogDescription>Vista previa del video. No modifica el progreso del alumnado.</DialogDescription></DialogHeader>
      <LessonVideo key={`${lesson.id}:${lesson.video?.id ?? lesson.videoUrl ?? ''}`} courseId={courseId} lesson={lesson} />
    </DialogContent>
  </Dialog>
}
