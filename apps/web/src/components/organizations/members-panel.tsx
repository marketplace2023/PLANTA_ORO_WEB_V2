import { UserMinus, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/base/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAddMember, useMembers, useRemoveMember } from '@/features/organizations/use-organizations'
import { ApiError } from '@/lib/api'

/** Personas que gestionan la organización. Solo el responsable (o el administrador) agrega y quita. */
export function MembersPanel({ kind, id, canEdit }: { kind: 'providers' | 'contractors'; id: string; canEdit: boolean }) {
  const members = useMembers(kind, id)
  const add = useAddMember(kind, id)
  const remove = useRemoveMember(kind, id)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'OWNER' | 'MEMBER'>('MEMBER')
  const [error, setError] = useState<string>()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (!email.trim()) return setError('Indica el correo de la persona')
    try {
      await add.mutateAsync({ email: email.trim(), role })
      setEmail('')
      toast.success('Miembro agregado')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar')
    }
  }

  async function drop(userId: string, label: string) {
    try {
      await remove.mutateAsync(userId)
      toast.success(`${label} ya no gestiona la organización`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo quitar')
    }
  }

  if (members.isError) return <ErrorState onRetry={() => void members.refetch()} />
  if (members.isLoading || !members.data) return <Skeleton className="h-32" aria-busy="true" />

  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4" noValidate>
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="mb-email">Correo de la persona</Label>
            <Input id="mb-email" type="email" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@empresa.com" aria-invalid={!!error} />
          </div>
          <div className="w-44 space-y-1">
            <Label htmlFor="mb-role">Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'OWNER' | 'MEMBER')}>
              <SelectTrigger id="mb-role" className="h-10 w-full" aria-label="Rol">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Miembro</SelectItem>
                <SelectItem value="OWNER">Responsable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={add.isPending}>
            <UserPlus /> Agregar
          </Button>
          {error && (
            <p role="alert" className="w-full text-sm text-fur-red-500">
              {error}
            </p>
          )}
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              {canEdit && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.data.map((m) => (
              <TableRow key={m.userId}>
                <TableCell className="font-medium">
                  {m.firstName} {m.lastName}
                </TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>{m.role === 'OWNER' ? <Badge>Responsable</Badge> : <Badge variant="secondary">Miembro</Badge>}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" aria-label={`Quitar a ${m.firstName} ${m.lastName}`} disabled={remove.isPending} onClick={() => void drop(m.userId, `${m.firstName} ${m.lastName}`)}>
                      <UserMinus /> Quitar
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
