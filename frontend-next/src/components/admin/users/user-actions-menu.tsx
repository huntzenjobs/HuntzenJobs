'use client'

import { useState } from 'react'
import { MoreHorizontal, Ban, CheckCircle, Trash2, KeyRound, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AdminUser } from '@/hooks/admin/use-admin-users'
import ForcePlanDialog from './force-plan-dialog'

interface Props {
  user: AdminUser
  plans: any[]
  onAction: (action: string, userId: string, extra?: any) => Promise<void>
}

export default function UserActionsMenu({ user, plans, onAction }: Props) {
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [forcePlanOpen, setForcePlanOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [acting, setActing] = useState(false)

  const handleSuspend = async () => {
    if (!suspendReason.trim()) return
    setActing(true)
    await onAction('suspend', user.id, suspendReason)
    setActing(false)
    setSuspendOpen(false)
    setSuspendReason('')
  }

  const handleDelete = async () => {
    setActing(true)
    await onAction('delete', user.id)
    setActing(false)
    setDeleteOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onAction('reset-password', user.id)}>
            <KeyRound className="h-4 w-4 mr-2" />
            Réinitialiser MDP
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setForcePlanOpen(true)}>
            <ArrowUpDown className="h-4 w-4 mr-2" />
            Changer le plan
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.status === 'active' ? (
            <DropdownMenuItem
              className="text-orange-600"
              onClick={() => setSuspendOpen(true)}
            >
              <Ban className="h-4 w-4 mr-2" />
              Suspendre
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-green-600"
              onClick={() => onAction('reactivate', user.id)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Réactiver
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Suspend dialog */}
      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspendre {user.email} ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'utilisateur ne pourra plus accéder à l'application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reason">Raison de la suspension *</Label>
            <Input
              id="reason"
              placeholder="Ex: violation des CGU, fraude..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              disabled={!suspendReason.trim() || acting}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {acting ? 'Suspension...' : 'Suspendre'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement {user.email} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est <strong>irréversible</strong>. Le compte et toutes les données
              associées seront supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={acting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {acting ? 'Suppression...' : 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force plan dialog */}
      <ForcePlanDialog
        open={forcePlanOpen}
        onClose={() => setForcePlanOpen(false)}
        user={user}
        plans={plans}
        onConfirm={async (planId) => {
          await onAction('force-plan', user.id, planId)
          setForcePlanOpen(false)
        }}
      />
    </>
  )
}
