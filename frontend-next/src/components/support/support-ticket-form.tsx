"use client";

import { useRef, useState } from "react";
import { CheckCircle, Loader2, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";
import { useSubscription } from "@/contexts/subscription-context";
import {
  SupportTicketSubmissionError,
  type SupportTicketController,
} from "@/hooks/use-support";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface SupportTicketFormProps {
  controller: Pick<
    SupportTicketController,
    "isSubmitting" | "submitTicket" | "getTicketRequestId"
  >;
}

interface UploadedAttachment {
  file: File;
  path: string;
  requestId: string;
}

function safeFileName(file: File): string {
  const extension =
    file.type === "application/pdf"
      ? "pdf"
      : file.type.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
  const base =
    file.name
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "attachment";
  return `${base}.${extension}`;
}

export function SupportTicketForm({ controller }: SupportTicketFormProps) {
  const { user } = useAuth();
  const { planName } = useSubscription();
  const tSupport = useTranslations("support");
  const t = useTranslations("support.ticketForm");
  const { isSubmitting, submitTicket, getTicketRequestId } = controller;
  const uploadedAttachmentRef = useRef<UploadedAttachment | null>(null);

  const [category, setCategory] = useState("question");
  const [priority, setPriority] = useState("normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const pageUrl = typeof window !== "undefined" ? window.location.pathname : "";
  const userName = user?.user_metadata?.full_name || user?.email || "";
  const userEmail = user?.email || "";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    if (nextFile.size > MAX_FILE_SIZE) {
      toast.error(tSupport("toasts.fileTooLarge"));
      return;
    }
    if (
      !nextFile.type.startsWith("image/") &&
      nextFile.type !== "application/pdf"
    ) {
      toast.error(tSupport("toasts.fileFormatUnsupported"));
      return;
    }
    uploadedAttachmentRef.current = null;
    setFile(nextFile);
  };

  const uploadAttachment = async (requestId: string): Promise<string | null> => {
    if (!file || !user) return null;
    const previous = uploadedAttachmentRef.current;
    if (previous?.file === file && previous.requestId === requestId) {
      return previous.path;
    }

    try {
      const path = `${user.id}/${requestId}/${safeFileName(file)}`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("support-attachments")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      uploadedAttachmentRef.current = { file, path, requestId };
      return path;
    } catch {
      toast.error(tSupport("toasts.fileUploadError"));
      return null;
    }
  };

  const removeRejectedAttachment = async (error: unknown) => {
    const uploaded = uploadedAttachmentRef.current;
    if (
      !(error instanceof SupportTicketSubmissionError) ||
      !error.isDefinitive ||
      !uploaded ||
      !user ||
      !uploaded.path.startsWith(`${user.id}/${uploaded.requestId}/`)
    ) {
      return;
    }

    try {
      const supabase = createClient();
      const { error: removeError } = await supabase.storage
        .from("support-attachments")
        .remove([uploaded.path]);
      if (!removeError) uploadedAttachmentRef.current = null;
    } catch {
      // Le nettoyage ne doit jamais masquer l'erreur de création initiale.
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();
    if (trimmedSubject.length < 5) {
      toast.error(tSupport("toasts.subjectTooShort"));
      return;
    }
    if (trimmedDescription.length < 20) {
      toast.error(tSupport("toasts.descriptionTooShort"));
      return;
    }

    try {
      const requestId = getTicketRequestId();
      const attachmentUrl = file ? await uploadAttachment(requestId) : undefined;
      if (file && !attachmentUrl) return;
      const result = await submitTicket({
        category,
        priority,
        subject: trimmedSubject,
        description: trimmedDescription,
        attachment_url: attachmentUrl || undefined,
        page_url: pageUrl,
      });
      setSuccess(result.short_id);
      setSubject("");
      setDescription("");
      setFile(null);
      uploadedAttachmentRef.current = null;
    } catch (error: unknown) {
      await removeRejectedAttachment(error);
      toast.error(error instanceof Error ? error.message : t("submitError"));
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle className="h-10 w-10 text-green-500" />
        <div>
          <p className="font-semibold">{t("successTitle", { id: success })}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("successDescription")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSuccess(null)}>
          {t("newTicket")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <p><span className="font-medium text-foreground">{t("nameLabel")}</span> {userName}</p>
        <p><span className="font-medium text-foreground">{t("emailLabel")}</span> {userEmail}</p>
        <p><span className="font-medium text-foreground">{t("planLabel")}</span> {planName || t("freePlan")}</p>
        <p><span className="font-medium text-foreground">{t("pageLabel")}</span> {pageUrl}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("categoryLabel")}</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" className="z-[70]">
              <SelectItem value="bug">{t("categories.bug")}</SelectItem>
              <SelectItem value="question">{t("categories.question")}</SelectItem>
              <SelectItem value="suggestion">{t("categories.suggestion")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("priorityLabel")}</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" className="z-[70]">
              <SelectItem value="low">{t("priorities.low")}</SelectItem>
              <SelectItem value="normal">{t("priorities.normal")}</SelectItem>
              <SelectItem value="urgent">{t("priorities.urgent")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs" htmlFor="support-subject">{t("subjectLabel")}</Label>
        <Input id="support-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={tSupport("placeholders.subjectPlaceholder")} maxLength={150} className="h-8 text-xs" required />
      </div>

      <div className="space-y-1">
        <Label className="text-xs" htmlFor="support-description">{t("descriptionLabel")}</Label>
        <Textarea id="support-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={tSupport("placeholders.descriptionPlaceholder")} maxLength={2000} rows={4} className="resize-none text-xs" required />
        <p className="text-right text-[10px] text-muted-foreground">{description.length}/2000</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("attachmentLabel")}</Label>
        <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors", "hover:border-huntzen-blue hover:bg-muted/30")}>
          <Paperclip className="h-3.5 w-3.5" />
          {file ? file.name : t("attachmentHint")}
          <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      <Button type="submit" className="w-full" size="sm" disabled={isSubmitting}>
        {isSubmitting ? (
          <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{t("submitting")}</>
        ) : t("submit")}
      </Button>
    </form>
  );
}
