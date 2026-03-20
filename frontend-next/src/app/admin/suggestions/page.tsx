"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

const ASSISTANTS = [
  { id: "career-coach", label: "Nova – Coach Carrière" },
  { id: "job-scout", label: "Maria – Recherche" },
  { id: "cv-analyzer", label: "Sofia – Expert CV" },
  { id: "interview-sim", label: "Lucas – Entretien" },
  { id: "branding", label: "David – Branding" },
];

interface Suggestion {
  id: string;
  assistant_id: string;
  text: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

type SuggestionsMap = Record<string, Suggestion[]>;

export default function SuggestionsAdminPage() {
  const [suggestions, setSuggestions] = useState<SuggestionsMap>({});
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const getToken = async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || "";
  };

  const fetchSuggestions = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/admin/suggestions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur chargement");
      const data = await res.json();
      setSuggestions(data.suggestions || {});
    } catch {
      toast.error("Impossible de charger les suggestions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAdd = async (assistantId: string) => {
    const text = (newText[assistantId] || "").trim();
    if (!text) return;
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/admin/suggestions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assistant_id: assistantId, text }),
      });
      if (!res.ok) throw new Error();
      setNewText((prev) => ({ ...prev, [assistantId]: "" }));
      await fetchSuggestions();
      toast.success("Suggestion ajoutée");
    } catch {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/admin/suggestions/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error();
      await fetchSuggestions();
      toast.success(isActive ? "Suggestion activée" : "Suggestion désactivée");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleEditSave = async (id: string) => {
    const text = editText.trim();
    if (!text) return;
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/admin/suggestions/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      await fetchSuggestions();
      toast.success("Suggestion modifiée");
    } catch {
      toast.error("Erreur lors de la modification");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette suggestion ?")) return;
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/admin/suggestions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      await fetchSuggestions();
      toast.success("Suggestion supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Suggestions assistants</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gérez les questions exemples affichées sur l'écran d'accueil de chaque
          coach.
        </p>
      </div>

      <Tabs defaultValue={ASSISTANTS[0].id}>
        <TabsList className="flex flex-wrap gap-1 h-auto mb-4">
          {ASSISTANTS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="text-xs">
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {ASSISTANTS.map((assistant) => {
          const items = suggestions[assistant.id] || [];
          return (
            <TabsContent key={assistant.id} value={assistant.id}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{assistant.label}</span>
                    <Badge variant="outline">
                      {items.length} suggestion(s)
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      Aucune suggestion.
                    </p>
                  )}

                  {items.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                    >
                      <Switch
                        checked={s.is_active}
                        onCheckedChange={(val) => handleToggle(s.id, val)}
                        className="shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        {editingId === s.id ? (
                          <Input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave(s.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-8 text-sm"
                            autoFocus
                          />
                        ) : (
                          <span
                            className={`text-sm ${!s.is_active ? "line-through text-muted-foreground" : ""}`}
                          >
                            {s.text}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {editingId === s.id ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-600"
                              onClick={() => handleEditSave(s.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingId(s.id);
                              setEditText(s.text);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(s.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Add new suggestion */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Input
                      placeholder="Nouvelle suggestion…"
                      value={newText[assistant.id] || ""}
                      onChange={(e) =>
                        setNewText((prev) => ({
                          ...prev,
                          [assistant.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAdd(assistant.id);
                      }}
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleAdd(assistant.id)}
                      disabled={!(newText[assistant.id] || "").trim()}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Ajouter
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
