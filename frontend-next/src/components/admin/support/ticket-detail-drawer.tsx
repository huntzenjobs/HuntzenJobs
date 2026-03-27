"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { type AdminTicket } from "@/hooks/admin/use-admin-support";

interface Props {
  ticket: AdminTicket;
  onClose: () => void;
  onUpdate: (
    id: string,
    update: { status?: string; admin_reply?: string },
  ) => Promise<void>;
}

export function TicketDetailDrawer({ ticket, onClose, onUpdate }: Props) {
  const [status, setStatus] = useState<string>(ticket.status);
  const [reply, setReply] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(ticket.id, {
        status: status !== ticket.status ? status : undefined,
        admin_reply: reply.trim() || undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ticket #{ticket.short_id}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          {/* User info */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
            <p>
              <span className="font-medium">Email :</span> {ticket.user_email}
            </p>
            <p>
              <span className="font-medium">Plan :</span>{" "}
              {ticket.user_plan || "N/A"}
            </p>
            <p>
              <span className="font-medium">Page :</span>{" "}
              {ticket.page_url || "N/A"}
            </p>
            <p>
              <span className="font-medium">Date :</span>{" "}
              {new Date(ticket.created_at).toLocaleString("fr-FR")}
            </p>
          </div>

          <div className="flex gap-2">
            <Badge variant="outline">{ticket.category}</Badge>
            <Badge
              variant="outline"
              className={
                ticket.priority === "urgent"
                  ? "border-red-500 text-red-600"
                  : ticket.priority === "low"
                    ? "border-green-500 text-green-600"
                    : ""
              }
            >
              {ticket.priority}
            </Badge>
          </div>

          <div>
            <p className="font-semibold">{ticket.subject}</p>
            <p className="mt-1.5 text-muted-foreground whitespace-pre-wrap">
              {ticket.description}
            </p>
          </div>

          {ticket.attachment_signed_url && (
            <a
              href={ticket.attachment_signed_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-huntzen-blue hover:underline"
            >
              📎 Voir la pièce jointe
            </a>
          )}

          {ticket.admin_reply && (
            <div className="rounded-lg border-l-4 border-huntzen-turquoise bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Réponse précédente
              </p>
              <p className="text-xs whitespace-pre-wrap">
                {ticket.admin_reply}
              </p>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium">Statut</p>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Ouvert</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="resolved">Résolu</SelectItem>
                <SelectItem value="closed">Fermé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">Répondre à l'utilisateur</p>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Votre réponse sera envoyée par email + notification in-app..."
              rows={5}
              className="text-xs"
            />
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Envoi...
              </>
            ) : (
              "Envoyer la réponse"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
