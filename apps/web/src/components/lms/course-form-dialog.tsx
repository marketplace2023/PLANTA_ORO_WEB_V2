import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CourseAuthoring } from './course-authoring'
import type { CourseDetail, OwnerType } from '@/features/lms/use-lms'

export function CourseFormDialog({ course, owner, onClose, onSaved, initialStep }: { course?: CourseDetail; owner?: {ownerType: OwnerType; ownerId?: string}; onClose: () => void; onSaved?: (course: {id: string; step?: string}) => void; initialStep?: string }) {
  const navigate = useNavigate()
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="course-authoring-dialog"><DialogHeader><DialogTitle>{course ? 'Editar curso' : 'Nuevo curso'}</DialogTitle><DialogDescription>Prepara la presentación, el programa y la publicación de tu curso.</DialogDescription></DialogHeader><CourseAuthoring course={course} owner={owner} initialStep={initialStep} onClose={onClose} onCreated={(id, step) => { if (onSaved) onSaved({id, step}); else navigate(`/courses/${id}/edit?editor=1&step=${step}`); onClose() }} /></DialogContent></Dialog>
}
