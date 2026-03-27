"use client";

import { QueueWaitingState } from "@/lib/api/huntzen-client";

interface QueueWaitingIndicatorProps {
  queueState: QueueWaitingState;
}

export function QueueWaitingIndicator({ queueState }: QueueWaitingIndicatorProps) {
  const { estimatedWaitSeconds, elapsedSeconds, status } = queueState;
  const remaining = Math.max(0, estimatedWaitSeconds - elapsedSeconds);
  const progress = Math.min(95, (elapsedSeconds / Math.max(1, estimatedWaitSeconds)) * 100);

  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg bg-muted/50 border border-border animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="animate-spin text-primary">⟳</span>
        <span>
          {status === 'queued' ? "En file d'attente..." : 'Traitement en cours...'}
        </span>
      </div>
      {remaining > 0 && (
        <p className="text-xs text-muted-foreground">
          Réponse estimée dans ~{remaining} seconde{remaining > 1 ? 's' : ''}
        </p>
      )}
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
