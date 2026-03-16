"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Download } from "lucide-react";
import BroadcastNotificationDialog from "./broadcast-notification-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminUsers, type AdminUser } from "@/hooks/admin/use-admin-users";
import UserActionsMenu from "./user-actions-menu";
import UserDetailDrawer from "./user-detail-drawer";

const STATUS_COLORS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  suspended: "destructive",
  deleted: "outline",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-700",
  starter: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
  premium: "bg-amber-100 text-amber-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function UsersTable() {
  const {
    fetchUsers,
    suspendUser,
    reactivateUser,
    deleteUser,
    resetPassword,
    fetchPlans,
    loading,
  } = useAdminUsers();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const data = await fetchUsers({
        page,
        per_page: 25,
        search: search || undefined,
        plan: planFilter || undefined,
        status: statusFilter || undefined,
      });
      setUsers(data.users);
      setTotal(data.total);
    } finally {
      setFetching(false);
    }
  }, [fetchUsers, page, search, planFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetchPlans()
      .then(setPlans)
      .catch(() => {});
  }, [fetchPlans]);

  const handleAction = async (action: string, userId: string, extra?: any) => {
    let success = false;
    if (action === "suspend") success = await suspendUser(userId, extra);
    if (action === "reactivate") success = await reactivateUser(userId);
    if (action === "delete") success = await deleteUser(userId);
    if (action === "reset-password") await resetPassword(userId);
    if (success) load();
  };

  const openDetail = (user: AdminUser) => {
    setSelectedUser(user);
    setDrawerOpen(true);
  };

  const planName = (user: AdminUser) =>
    user.plan?.subscription_plans?.name || "free";

  const planDisplay = (user: AdminUser) =>
    user.plan?.subscription_plans?.display_name || "Free";

  const exportToCSV = () => {
    const headers = [
      "Email",
      "Nom",
      "Plan",
      "Statut",
      "Inscrit le",
      "Fin abonnement",
    ];
    const rows = users.map((u) => [
      u.email,
      u.full_name || "",
      planDisplay(u),
      u.status,
      u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : "",
      u.plan?.current_period_end
        ? new Date(u.plan.current_period_end).toISOString().slice(0, 10)
        : "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `huntzen-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Utilisateurs ({total})</CardTitle>
            <div className="flex gap-2">
              <BroadcastNotificationDialog />
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={users.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${fetching ? "animate-spin" : ""}`}
                />
                Actualiser
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mt-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-9"
              />
            </div>

            <Select
              value={planFilter || "all"}
              onValueChange={(v) => {
                setPlanFilter(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les plans</SelectItem>
                {plans.map((p: any) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter || "all"}
              onValueChange={(v) => {
                setStatusFilter(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="suspended">Suspendu</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Utilisateur
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Statut
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Usage aujourd'hui
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Inscrit le
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Fin abo
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {fetching && users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Chargement...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Aucun utilisateur trouvé
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => openDetail(user)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {user.full_name || "—"}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {user.email}
                        </div>
                        {user.is_admin && (
                          <span className="text-xs text-primary font-medium">
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[planName(user)] || PLAN_COLORS.free}`}
                        >
                          {planDisplay(user)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={STATUS_COLORS[user.status] || "outline"}
                        >
                          {user.status === "active"
                            ? "Actif"
                            : user.status === "suspended"
                              ? "Suspendu"
                              : "Supprimé"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {user.usage_today ? (
                          <span>
                            {user.usage_today.cv_analyses_used} CV ·{" "}
                            {Math.round(
                              (user.usage_today.coach_seconds_used || 0) / 60,
                            )}
                            min coach
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {user.plan?.current_period_end
                          ? formatDate(user.plan.current_period_end)
                          : "—"}
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <UserActionsMenu
                          user={user}
                          plans={plans}
                          onAction={handleAction}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 25 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} sur {total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * 25 >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <UserDetailDrawer
        userId={selectedUser?.id || null}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAction={handleAction}
        plans={plans}
      />
    </>
  );
}
