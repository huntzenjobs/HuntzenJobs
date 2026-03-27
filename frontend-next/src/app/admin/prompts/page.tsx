"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Save, RefreshCw, ChevronRight } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function adminFetch(path: string, options?: RequestInit) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface PromptMeta {
  name: string;
  display_name: string;
  updated_at: string | null;
  updated_by: string | null;
}

interface PromptFull extends PromptMeta {
  content: string;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptMeta[]>([]);
  const [selected, setSelected] = useState<PromptFull | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/prompts");
      setPrompts(data.prompts || []);
    } catch {
      toast.error("Impossible de charger les prompts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const selectPrompt = async (name: string) => {
    if (dirty && selected) {
      if (
        !confirm(
          "Des modifications non sauvegardées seront perdues. Continuer ?",
        )
      )
        return;
    }
    setLoadingDetail(true);
    try {
      const data = await adminFetch(`/api/admin/prompts/${name}`);
      setSelected(data);
      setEditContent(data.content);
      setDirty(false);
    } catch {
      toast.error("Impossible de charger ce prompt");
    } finally {
      setLoadingDetail(false);
    }
  };

  const savePrompt = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminFetch(`/api/admin/prompts/${selected.name}`, {
        method: "PUT",
        body: JSON.stringify({ content: editContent }),
      });
      toast.success("Prompt enregistré");
      setDirty(false);
      // Rafraîchir la liste pour updated_at
      await loadList();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la sauvegarde",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6" />
          Éditeur de Prompts IA
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Modifiez les prompts sans redéployer. Les changements sont actifs
          immédiatement.
        </p>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-6 items-start">
        {/* Liste */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Prompts</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadList}
              disabled={loading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Chargement...
              </div>
            ) : (
              <div className="divide-y">
                {prompts.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => selectPrompt(p.name)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between group ${
                      selected?.name === p.name ? "bg-muted" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.display_name}
                      </div>
                      {p.updated_at && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(p.updated_at)}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Éditeur */}
        <Card>
          {selected ? (
            <>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">
                    {selected.display_name}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs text-muted-foreground bg-muted px-1 rounded">
                      {selected.name}
                    </code>
                    {dirty && (
                      <Badge variant="outline" className="text-[10px]">
                        Modifié
                      </Badge>
                    )}
                  </div>
                  {selected.updated_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Dernière modif : {formatDate(selected.updated_at)}
                    </p>
                  )}
                </div>
                <Button
                  onClick={savePrompt}
                  disabled={saving || !dirty}
                  size="sm"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Sauvegarde..." : "Enregistrer"}
                </Button>
              </CardHeader>
              <CardContent>
                {loadingDetail ? (
                  <div className="h-96 flex items-center justify-center text-muted-foreground text-sm">
                    Chargement...
                  </div>
                ) : (
                  <Textarea
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                      setDirty(true);
                    }}
                    className="font-mono text-xs min-h-[500px] resize-y"
                    placeholder="Contenu du prompt..."
                  />
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Sélectionnez un prompt dans la liste pour l'éditer.
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
