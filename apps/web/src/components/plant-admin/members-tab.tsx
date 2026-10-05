import { Plus, Trash2, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAssignableRoles, useAssignMember, useMembers, useRemoveMember, type Member } from '@/features/plant/use-plant-admin'
import { ApiError } from '@/lib/api'
import { ROLE_LABELS } from '@/lib/roles'

function AssignDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const assign = useAssignMember(slug)
  const roles = useAssignableRoles(slug)
  const [email, setEmail] = useState('')
  const [roleCode, setRoleCode] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Ingresa un correo válido'
    if (!roleCode) next.roleCode = 'Selecciona un rol'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    try {
      await assign.mutateAsync({ email: email.trim(), roleCode })
      toast.success('Rol asignado')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setErrors({ email: 'No existe un usuario con ese correo. Debe registrarse primero.' })
      else if (err instanceof ApiError && err.status === 409) setErrors({ roleCode: 'El usuario ya tiene ese rol en la planta.' })
      else if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ form: err instanceof ApiError ? err.message : 'No se pudo asignar el rol.' })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar rol</DialogTitle>
          <DialogDescription>La persona debe tener una cuenta. Un usuario puede tener varios roles en la misma planta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="member-email">Correo electrónico</Label>
            <Input id="member-email" type="email" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
            {errors.email && <p className="text-sm text-fur-red-500">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-role">Rol</Label>
            <Select value={roleCode} onValueChange={setRoleCode}>
              <SelectTrigger id="member-role" className="h-10 w-full" aria-label="Rol" aria-invalid={!!errors.roleCode}>
                <SelectValue placeholder={roles.isLoading ? 'Cargando…' : 'Selecciona un rol'} />
              </SelectTrigger>
              <SelectContent>
                {(roles.data ?? []).map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {ROLE_LABELS[r.code] ?? r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.roleCode && <p className="text-sm text-fur-red-500">{errors.roleCode}</p>}
          </div>
          <div role="alert" aria-live="polite">
            {errors.form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors.form}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={assign.isPending}>
              {assign.isPending ? 'Asignando…' : 'Asignar rol'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RemoveDialog({ slug, member, onClose }: { slug: string; member: Member; onClose: () => void }) {
  const remove = useRemoveMember(slug)
  const [error, setError] = useState<string>()
  async function confirm() {
    try {
      await remove.mutateAsync(member.id)
      toast.success('Rol retirado')
      onClose()
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'No tienes permiso para retirar roles.' : 'No se pudo retirar el rol.')
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Retirar el rol de {member.firstName} {member.lastName}?</DialogTitle>
          <DialogDescription>
            Perderá el rol «{ROLE_LABELS[member.roleCode] ?? member.roleName}» en esta planta. Si no tiene otros roles, dejará de ser miembro.
          </DialogDescription>
        </DialogHeader>
        <div role="alert" aria-live="polite">
          {error && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={remove.isPending}>
            {remove.isPending ? 'Retirando…' : 'Retirar rol'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Miembros de la planta y sus roles (iam.user_plant_roles). */
export function MembersTab({ slug }: { slug: string }) {
  const members = useMembers(slug)
  const [assigning, setAssigning] = useState(false)
  const [removing, setRemoving] = useState<Member | null>(null)

  return (
    <>
      <div className="mb-4 flex justify-end">
        <PermissionGate permission="user.assign">
          <Button onClick={() => setAssigning(true)}>
            <Plus /> Asignar rol
          </Button>
        </PermissionGate>
      </div>

      {members.isError ? (
        <ErrorState onRetry={() => void members.refetch()} />
      ) : members.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando miembros">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (members.data?.length ?? 0) === 0 ? (
        <EmptyState icon={Users} title="Esta planta aún no tiene miembros" description="Asigna roles a usuarios registrados para que puedan trabajar en ella." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data!.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">
                      {m.firstName} {m.lastName}
                    </div>
                    <div className="text-xs text-fur-gray-600">{m.email}</div>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[m.roleCode] ?? m.roleName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-card font-medium text-foreground">
                      {m.status === 'ACTIVE' ? 'Activo' : m.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="user.assign">
                      <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(m)} aria-label={`Retirar rol ${ROLE_LABELS[m.roleCode] ?? m.roleName} a ${m.firstName} ${m.lastName}`}>
                        <Trash2 />
                      </Button>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {assigning && <AssignDialog slug={slug} onClose={() => setAssigning(false)} />}
      {removing && <RemoveDialog slug={slug} member={removing} onClose={() => setRemoving(null)} />}
    </>
  )
}
