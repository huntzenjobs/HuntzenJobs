'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { AdminUser } from '@/hooks/admin/use-admin-users'

interface Props {
  open: boolean
  onClose: () => void
  user: AdminUser
  plans: any[]
  onConfirm: (planId: string) => Promise<void>
}

export default function ForcePlanDialog({ open, onClose, user, plans, onConfirm }: Props) {
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [acting, setActing] = useState(false)

  const currentPlanName = user.plan?.subscription_plans?.display_name || 'Free'
  const selectedPlan = plans.find((p) => p.id === selectedPlanId)

  const handleConfirm = async () => {
    if (!selectedPlanId) return
    setActing(true)
    await onConfirm(selectedPlanId)
    setActing(false)
    setSelectedPlanId('')
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Changer le plan de {user.email}</AlertDialogTitle>
          <AlertDialogDescription>
            Plan actuel : <strong>{currentPlanName}</strong>.
            Cette action modifie uniquement la base de données — Stripe n'est pas modifié.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label>Nouveau plan</Label>
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un plan..." />
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.display_name} ({plan.price_monthly === 0 ? 'Gratuit' : `€${plan.price_monthly}/mois`})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPlan && (
            <p className="text-xs text-muted-foreground">
              L'utilisateur aura les limites du plan <strong>{selectedPlan.display_name}</strong> immédiatement.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Annuler</AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={!selectedPlanId || acting}
          >
            {acting ? 'Modification...' : 'Confirmer le changement'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
