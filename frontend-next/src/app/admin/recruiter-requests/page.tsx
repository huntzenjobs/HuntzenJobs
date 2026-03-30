"use client";

import { createClient } from "@/lib/supabase/client";
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Euro,
  Mail,
  Phone,
  Search,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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

type PaymentStatus = "pending" | "paid" | "refunded" | "failed";
type RequestStatus =
  | "new"
  | "assigned"
  | "scheduled"
  | "completed"
  | "cancelled";

interface RecruiterRequest {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  sector: string;
  experience_level: string;
  message: string;
  preferred_date: string | null;
  payment_status: PaymentStatus;
  payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  amount_cents: number;
  status: RequestStatus;
  assigned_recruiter_id: string | null;
  scheduled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS = {
  new: "bg-blue-100 text-blue-700",
  assigned: "bg-purple-100 text-purple-700",
  scheduled: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const PAYMENT_STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  refunded: "bg-muted text-muted-foreground",
  failed: "bg-red-100 text-red-700",
};

export default function RecruiterRequestsAdminPage() {
  const [requests, setRequests] = useState<RecruiterRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<RecruiterRequest[]>(
    [],
  );
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">(
    "all",
  );
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">(
    "all",
  );
  const [selectedRequest, setSelectedRequest] =
    useState<RecruiterRequest | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams({ page: "1", per_page: "100" });
      if (searchQuery) qs.set("search", searchQuery);
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (paymentFilter !== "all") qs.set("payment_status", paymentFilter);
      const data = await adminFetch(`/api/admin/recruiter-requests?${qs}`);
      setRequests(data.requests || []);
      setFilteredRequests(data.requests || []);
      setTotal(data.total || 0);
    } catch (error) {
      toast.error("Impossible de charger les demandes");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, paymentFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const updateRequestStatus = async (
    requestId: string,
    newStatus: RequestStatus,
  ) => {
    try {
      await adminFetch(`/api/admin/recruiter-requests/${requestId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success("Statut mis à jour");
      await fetchRequests();
      if (selectedRequest?.id === requestId) {
        setSelectedRequest((prev) =>
          prev ? { ...prev, status: newStatus } : prev,
        );
      }
    } catch (error) {
      toast.error("Erreur lors de la mise à jour du statut");
    }
  };

  const deleteRequest = async (requestId: string) => {
    if (
      !window.confirm(
        "Supprimer définitivement cette demande de consultation ? Cette action est irréversible.",
      )
    ) {
      return;
    }
    try {
      await adminFetch(`/api/admin/recruiter-requests/${requestId}`, {
        method: "DELETE",
      });
      toast.success("Demande supprimée");
      setSelectedRequest((prev) =>
        prev && prev.id === requestId ? null : prev,
      );
      await fetchRequests();
    } catch (error) {
      toast.error("Erreur lors de la suppression de la demande");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatAmount = (amountCents: number) => {
    return `${(amountCents / 100).toFixed(2)}€`;
  };

  const exportToCSV = () => {
    const headers = [
      "Date",
      "Nom",
      "Email",
      "Téléphone",
      "Secteur",
      "Expérience",
      "Statut Paiement",
      "Statut Demande",
      "Montant",
    ];
    const rows = filteredRequests.map((req) => [
      formatDate(req.created_at),
      req.full_name,
      req.email,
      req.phone || "N/A",
      req.sector,
      req.experience_level,
      req.payment_status,
      req.status,
      formatAmount(req.amount_cents),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recruiter-requests-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement des demandes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Demandes de Consultation Recruteur
          </h1>
          <p className="text-muted-foreground">
            Gérer et suivre toutes les demandes de consultation
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Total</p>
                <p className="text-2xl font-bold text-foreground">
                  {requests.length}
                </p>
              </div>
              <User className="w-8 h-8 text-primary" />
            </div>
          </div>

          <div className="bg-card border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Payées</p>
                <p className="text-2xl font-bold text-green-600">
                  {requests.filter((r) => r.payment_status === "paid").length}
                </p>
              </div>
              <Euro className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-card border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">En attente</p>
                <p className="text-2xl font-bold text-amber-600">
                  {
                    requests.filter(
                      (r) => r.status === "new" || r.status === "assigned",
                    ).length
                  }
                </p>
              </div>
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
          </div>

          <div className="bg-card border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Complétées</p>
                <p className="text-2xl font-bold text-purple-600">
                  {requests.filter((r) => r.status === "completed").length}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-card border rounded-lg p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, email, secteur..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-card border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as RequestStatus | "all")
                }
                className="w-full px-4 py-2 bg-card border rounded-lg text-foreground focus:outline-none focus:border-primary"
              >
                <option value="all">Tous les statuts</option>
                <option value="new">Nouveau</option>
                <option value="assigned">Assigné</option>
                <option value="scheduled">Planifié</option>
                <option value="completed">Complété</option>
                <option value="cancelled">Annulé</option>
              </select>
            </div>

            {/* Payment Filter */}
            <div>
              <select
                value={paymentFilter}
                onChange={(e) =>
                  setPaymentFilter(e.target.value as PaymentStatus | "all")
                }
                className="w-full px-4 py-2 bg-card border rounded-lg text-foreground focus:outline-none focus:border-primary"
              >
                <option value="all">Tous les paiements</option>
                <option value="paid">Payé</option>
                <option value="pending">En attente</option>
                <option value="failed">Échoué</option>
                <option value="refunded">Remboursé</option>
              </select>
            </div>
          </div>

          {/* Export Button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
          </div>
        </div>

        {/* Requests Table */}
        <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
                    Candidat
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
                    Secteur
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
                    Paiement
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Aucune demande trouvée
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => (
                    <tr
                      key={request.id}
                      className="hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => setSelectedRequest(request)}
                    >
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(request.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-foreground font-medium">
                            {request.full_name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {request.experience_level}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3" />
                            {request.email}
                          </div>
                          {request.phone && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {request.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {request.sector}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_STATUS_COLORS[request.payment_status]}`}
                        >
                          {request.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[request.status]}`}
                        >
                          {request.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={request.status}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateRequestStatus(
                                request.id,
                                e.target.value as RequestStatus,
                              );
                            }}
                            className="px-2 py-1 text-xs bg-card border rounded text-foreground focus:outline-none focus:border-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="new">Nouveau</option>
                            <option value="assigned">Assigné</option>
                            <option value="scheduled">Planifié</option>
                            <option value="completed">Complété</option>
                            <option value="cancelled">Annulé</option>
                          </select>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRequest(request.id);
                            }}
                            className="p-1 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                            aria-label="Supprimer la demande"
                            title="Supprimer la demande"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Request Details Modal */}
        {selectedRequest && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-foreground">
                    Détails de la demande
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => deleteRequest(selectedRequest.id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      Supprimer
                    </button>
                    <button
                      onClick={() => setSelectedRequest(null)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Candidate Info */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Informations candidat
                    </h3>
                    <div className="bg-muted rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-muted-foreground text-sm">
                            Nom complet
                          </p>
                          <p className="text-foreground font-medium">
                            {selectedRequest.full_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-muted-foreground text-sm">Email</p>
                          <p className="text-foreground font-medium">
                            {selectedRequest.email}
                          </p>
                        </div>
                      </div>
                      {selectedRequest.phone && (
                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5 text-primary" />
                          <div>
                            <p className="text-muted-foreground text-sm">
                              Téléphone
                            </p>
                            <p className="text-foreground font-medium">
                              {selectedRequest.phone}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <Briefcase className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-muted-foreground text-sm">
                            Secteur / Expérience
                          </p>
                          <p className="text-foreground font-medium">
                            {selectedRequest.sector} -{" "}
                            {selectedRequest.experience_level}
                          </p>
                        </div>
                      </div>
                      {selectedRequest.preferred_date && (
                        <div className="flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-primary" />
                          <div>
                            <p className="text-muted-foreground text-sm">
                              Date préférée
                            </p>
                            <p className="text-foreground font-medium">
                              {formatDate(selectedRequest.preferred_date)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Message du candidat
                    </h3>
                    <div className="bg-muted rounded-lg p-4">
                      <p className="text-foreground leading-relaxed">
                        {selectedRequest.message}
                      </p>
                    </div>
                  </div>

                  {/* Payment Info */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Informations paiement
                    </h3>
                    <div className="bg-muted rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Montant</span>
                        <span className="text-foreground font-bold">
                          {formatAmount(selectedRequest.amount_cents)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Statut paiement
                        </span>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_STATUS_COLORS[selectedRequest.payment_status]}`}
                        >
                          {selectedRequest.payment_status}
                        </span>
                      </div>
                      {selectedRequest.payment_intent_id && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Payment Intent ID
                          </span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {selectedRequest.payment_intent_id}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Statut de la demande
                    </h3>
                    <div className="bg-muted rounded-lg p-4">
                      <select
                        value={selectedRequest.status}
                        onChange={(e) =>
                          updateRequestStatus(
                            selectedRequest.id,
                            e.target.value as RequestStatus,
                          )
                        }
                        className="w-full px-4 py-2 bg-card border rounded-lg text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="new">🆕 Nouveau</option>
                        <option value="assigned">👤 Assigné</option>
                        <option value="scheduled">📅 Planifié</option>
                        <option value="completed">✅ Complété</option>
                        <option value="cancelled">❌ Annulé</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
