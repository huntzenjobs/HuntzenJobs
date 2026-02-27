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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import type { Plan, StripePrice } from '@/hooks/admin/use-admin-plans'

interface Props {
  open: boolean
  onClose: () => void
  plan: Plan
  billingPeriod: 'monthly' | 'yearly'
  currentPrice: StripePrice | undefined
  onConfirm: (unitAmount: number, currency: string) => Promise<void>
}

export default function StripePriceDialog({
  open, onClose, plan, billingPeriod, currentPrice, onConfirm
}: Props) {
  const [amountEur, setAmountEur] = useState('')
  const [step, setStep] = useState<'input' | 'confirm'>('input')
  const [acting, setActing] = useState(false)

  const unitAmount = Math.round(parseFloat(amountEur) * 100)
  const isValid = !isNaN(unitAmount) && unitAmount >= 50

  const handleClose = () => {
    setAmountEur('')
    setStep('input')
    onClose()
  }

  const handleConfirm = async () => {
    setActing(true)
    await onConfirm(unitAmount, 'eur')
    setActing(false)
    handleClose()
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Modifier le prix Stripe — {plan.display_name} ({billingPeriod === 'monthly' ? 'mensuel' : 'annuel'})
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Stripe ne permet <strong>pas</strong> de modifier un prix existant.
                  Un <strong>nouveau prix</strong> sera créé et l'ancien sera archivé automatiquement.
                </span>
              </div>
              {currentPrice && (
                <div className="text-sm text-muted-foreground">
                  Prix actuel :{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{currentPrice.stripe_price_id}</code>
                  {' '}→ sera archivé
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === 'input' ? (
          <>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="price-eur">Nouveau prix (€)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">€</span>
                  <Input
                    id="price-eur"
                    className="pl-7"
                    placeholder="8.90"
                    value={amountEur}
                    onChange={(e) => setAmountEur(e.target.value)}
                    type="number"
                    min="0.50"
                    step="0.01"
                  />
                </div>
                {isValid && (
                  <p className="text-xs text-muted-foreground">
                    = {unitAmount} centimes · nouveau Stripe Price créé pour {plan.display_name}
                  </p>
                )}
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleClose}>Annuler</AlertDialogCancel>
              <Button onClick={() => setStep('confirm')} disabled={!isValid}>
                Continuer
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <div className="py-2 space-y-3">
              <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{plan.display_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Période</span>
                  <span className="font-medium">{billingPeriod === 'monthly' ? 'Mensuel' : 'Annuel'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nouveau prix</span>
                  <span className="font-medium text-green-700">€{parseFloat(amountEur).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ancien prix</span>
                  <Badge variant="destructive" className="text-xs">Archivé dans Stripe</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Les <strong>abonnements existants</strong> ne sont pas affectés (Stripe maintient les prix historiques).
                Seuls les <strong>nouveaux checkouts</strong> utiliseront ce prix.
              </p>
            </div>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setStep('input')}>Retour</Button>
              <Button
                onClick={handleConfirm}
                disabled={acting}
                className="bg-destructive hover:bg-destructive/90"
              >
                {acting ? 'Création en cours...' : 'Confirmer et archiver l\'ancien prix'}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
