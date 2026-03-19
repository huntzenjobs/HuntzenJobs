"use client";

import { useState } from "react";
import { Paperclip, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useSubscription } from "@/contexts/subscription-context";
import { useSupportTicket } from "@/hooks/use-support";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function SupportTicketForm() {
  const { user } = useAuth();
  const { planName } = useSubscription();
  const tSupport = useTranslations("support");
  const { isSubmitting, submitTicket, refetch } = useSupportTicket();

  const [category, setCategory] = useState("question");
  const [priority, setPriority] = useState("normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const pageUrl = typeof window !== "undefined" ? window.location.pathname : "";
  const userName = user?.user_metadata?.full_name || user?.email || "";
  const userEmail = user?.email || "";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      toast.error(tSupport("toasts.fileTooLarge"));
      return;
    }
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
      toast.error(tSupport("toasts.fileFormatUnsupported"));
      return;
    }
    setFile(f);
  };

  const uploadAttachment = async (): Promise<string | null> => {
    if (!file || !user) return null;
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("support-attachments")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      return path;
    } catch (err) {
      toast.error(tSupport("toasts.fileUploadError"));
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.length < 5) {
      toast.error(tSupport("toasts.subjectTooShort"));
      return;
    }
    if (description.length < 20) {
      toast.error(tSupport("toasts.descriptionTooShort"));
      return;
    }

    try {
      const attachmentUrl = file ? await uploadAttachment() : undefined;
      const result = await submitTicket({
        category,
        priority,
        subject,
        description,
        attachment_url: attachmentUrl || undefined,
        page_url: pageUrl,
      });
      setSuccess(result.short_id);
      setSubject("");
      setDescription("");
      setFile(null);
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'envoi";
      toast.error(msg);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle className="w-10 h-10 text-green-500" />
        <div>
          <p className="font-semibold">Ticket #{success} envoyé !</p>
          <p className="text-sm text-muted-foreground mt-1">
            Notre équipe vous répondra rapidement.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSuccess(null)}>
          Nouveau ticket
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Auto-filled (read-only) */}
      <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Nom :</span> {userName}
        </p>
        <p>
          <span className="font-medium text-foreground">Email :</span>{" "}
          {userEmail}
        </p>
        <p>
          <span className="font-medium text-foreground">Plan :</span>{" "}
          {planName || "Gratuit"}
        </p>
        <p>
          <span className="font-medium text-foreground">Page :</span> {pageUrl}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Catégorie</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bug">🐛 Bug</SelectItem>
              <SelectItem value="question">❓ Question</SelectItem>
              <SelectItem value="suggestion">💡 Suggestion</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Priorité</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">🟢 Faible</SelectItem>
              <SelectItem value="normal">🟡 Normale</SelectItem>
              <SelectItem value="urgent">🔴 Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Sujet *</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={tSupport("placeholders.subjectPlaceholder")}
          maxLength={150}
          className="h-8 text-xs"
          required
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Description *</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={tSupport("placeholders.descriptionPlaceholder")}
          maxLength={2000}
          rows={4}
          className="text-xs resize-none"
          required
        />
        <p className="text-[10px] text-muted-foreground text-right">
          {description.length}/2000
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Pièce jointe (optionnelle)</Label>
        <label
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border",
            "text-xs text-muted-foreground cursor-pointer hover:border-huntzen-blue hover:bg-muted/30 transition-colors",
          )}
        >
          <Paperclip className="w-3.5 h-3.5" />
          {file ? file.name : "Image ou PDF, max 5MB"}
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      <Button
        type="submit"
        className="w-full"
        size="sm"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            Envoi...
          </>
        ) : (
          "Envoyer le ticket"
        )}
      </Button>
    </form>
  );
}
