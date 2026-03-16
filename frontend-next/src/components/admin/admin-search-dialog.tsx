"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, User, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function adminSearch(q: string) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return [];
  const res = await fetch(
    `${BACKEND_URL}/api/admin/search?q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.users || [];
}

export function AdminSearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const users = await adminSearch(q);
      setResults(users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (userId: string) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/admin/users?user=${userId}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-background rounded-xl shadow-2xl border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="[&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:px-4 [&_[cmdk-input-wrapper]]:py-3">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            {loading ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
            ) : (
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <Command.Input
              autoFocus
              placeholder="Rechercher un utilisateur (email, nom)..."
              value={query}
              onValueChange={setQuery}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-64 overflow-y-auto p-2">
            {results.length === 0 && query.length >= 2 && !loading && (
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                Aucun résultat pour « {query} »
              </Command.Empty>
            )}
            {query.length < 2 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Tapez au moins 2 caractères pour rechercher
              </div>
            )}
            {results.map((user: any) => (
              <Command.Item
                key={user.id}
                value={user.email}
                onSelect={() => handleSelect(user.id)}
                className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm hover:bg-muted aria-selected:bg-muted"
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.email}</p>
                  {user.full_name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {user.full_name}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    user.status === "active"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {user.status}
                </span>
              </Command.Item>
            ))}
          </Command.List>

          <div className="border-t px-4 py-2 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Recherche globale admin · Cmd+K pour fermer
            </p>
            {results.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {results.length} résultat{results.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </Command>
      </div>
    </div>
  );
}
