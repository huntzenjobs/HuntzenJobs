'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search,
  Filter,
  Download,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Mail,
  Phone,
  Briefcase,
  MessageSquare,
  Euro
} from 'lucide-react'

type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed'
type RequestStatus = 'new' | 'assigned' | 'scheduled' | 'completed' | 'cancelled'

interface RecruiterRequest {
  id: string
  user_id: string
  full_name: string
  email: string
  phone: string | null
  sector: string
  experience_level: string
  message: string
  preferred_date: string | null
  payment_status: PaymentStatus
  payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  amount_cents: number
  status: RequestStatus
  assigned_recruiter_id: string | null
  scheduled_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const STATUS_COLORS = {
  new: 'bg-blue-500/20 text-blue-400',
  assigned: 'bg-purple-500/20 text-purple-400',
  scheduled: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
}

const PAYMENT_STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  paid: 'bg-green-500/20 text-green-400',
  refunded: 'bg-gray-500/20 text-gray-400',
  failed: 'bg-red-500/20 text-red-400',
}

export default function RecruiterRequestsAdminPage() {
  const [requests, setRequests] = useState<RecruiterRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<RecruiterRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all')
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | 'all'>('all')
  const [selectedRequest, setSelectedRequest] = useState<RecruiterRequest | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchRequests()
  }, [])

  useEffect(() => {
    filterRequests()
  }, [requests, searchQuery, statusFilter, paymentFilter])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('recruiter_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error fetching requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterRequests = () => {
    let filtered = [...requests]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(req =>
        req.full_name.toLowerCase().includes(query) ||
        req.email.toLowerCase().includes(query) ||
        req.sector.toLowerCase().includes(query) ||
        req.message.toLowerCase().includes(query)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(req => req.status === statusFilter)
    }

    // Payment filter
    if (paymentFilter !== 'all') {
      filtered = filtered.filter(req => req.payment_status === paymentFilter)
    }

    setFilteredRequests(filtered)
  }

  const updateRequestStatus = async (requestId: string, newStatus: RequestStatus) => {
    try {
      const { error } = await supabase
        .from('recruiter_requests')
        .update({ status: newStatus })
        .eq('id', requestId)

      if (error) throw error
      await fetchRequests()
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Erreur lors de la mise à jour du statut')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatAmount = (amountCents: number) => {
    return `${(amountCents / 100).toFixed(2)}€`
  }

  const exportToCSV = () => {
    const headers = ['Date', 'Nom', 'Email', 'Téléphone', 'Secteur', 'Expérience', 'Statut Paiement', 'Statut Demande', 'Montant']
    const rows = filteredRequests.map(req => [
      formatDate(req.created_at),
      req.full_name,
      req.email,
      req.phone || 'N/A',
      req.sector,
      req.experience_level,
      req.payment_status,
      req.status,
      formatAmount(req.amount_cents),
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recruiter-requests-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-huntzen-blue mx-auto mb-4"></div>
          <p className="text-white/60">Chargement des demandes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Demandes de Consultation Recruteur
          </h1>
          <p className="text-white/60">
            Gérer et suivre toutes les demandes de consultation
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm">Total</p>
                <p className="text-2xl font-bold text-white">{requests.length}</p>
              </div>
              <User className="w-8 h-8 text-huntzen-blue" />
            </div>
          </div>

          <div className="bg-slate-900 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm">Payées</p>
                <p className="text-2xl font-bold text-green-400">
                  {requests.filter(r => r.payment_status === 'paid').length}
                </p>
              </div>
              <Euro className="w-8 h-8 text-green-400" />
            </div>
          </div>

          <div className="bg-slate-900 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm">En attente</p>
                <p className="text-2xl font-bold text-amber-400">
                  {requests.filter(r => r.status === 'new' || r.status === 'assigned').length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
          </div>

          <div className="bg-slate-900 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm">Complétées</p>
                <p className="text-2xl font-bold text-purple-400">
                  {requests.filter(r => r.status === 'completed').length}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-slate-900 border border-white/10 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, email, secteur..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-huntzen-blue"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as RequestStatus | 'all')}
                className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-huntzen-blue"
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
                onChange={(e) => setPaymentFilter(e.target.value as PaymentStatus | 'all')}
                className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-huntzen-blue"
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
              className="flex items-center gap-2 px-4 py-2 bg-huntzen-blue text-white rounded-lg hover:bg-huntzen-blue/80 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
          </div>
        </div>

        {/* Requests Table */}
        <div className="bg-slate-900 border border-white/10 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/80">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/80">Candidat</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/80">Contact</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/80">Secteur</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/80">Paiement</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/80">Statut</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/80">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-white/40">
                      Aucune demande trouvée
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => (
                    <tr
                      key={request.id}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedRequest(request)}
                    >
                      <td className="px-4 py-3 text-sm text-white/60">
                        {formatDate(request.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-white font-medium">{request.full_name}</p>
                          <p className="text-white/40 text-xs">{request.experience_level}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <Mail className="w-3 h-3" />
                            {request.email}
                          </div>
                          {request.phone && (
                            <div className="flex items-center gap-2 text-xs text-white/60">
                              <Phone className="w-3 h-3" />
                              {request.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">{request.sector}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_STATUS_COLORS[request.payment_status]}`}>
                          {request.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[request.status]}`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={request.status}
                          onChange={(e) => {
                            e.stopPropagation()
                            updateRequestStatus(request.id, e.target.value as RequestStatus)
                          }}
                          className="px-2 py-1 text-xs bg-slate-800 border border-white/10 rounded text-white focus:outline-none focus:border-huntzen-blue"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="new">Nouveau</option>
                          <option value="assigned">Assigné</option>
                          <option value="scheduled">Planifié</option>
                          <option value="completed">Complété</option>
                          <option value="cancelled">Annulé</option>
                        </select>
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-white/10 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Détails de la demande</h2>
                  <button
                    onClick={() => setSelectedRequest(null)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Candidate Info */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Informations candidat</h3>
                    <div className="bg-slate-800 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-huntzen-blue" />
                        <div>
                          <p className="text-white/60 text-sm">Nom complet</p>
                          <p className="text-white font-medium">{selectedRequest.full_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-huntzen-blue" />
                        <div>
                          <p className="text-white/60 text-sm">Email</p>
                          <p className="text-white font-medium">{selectedRequest.email}</p>
                        </div>
                      </div>
                      {selectedRequest.phone && (
                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5 text-huntzen-blue" />
                          <div>
                            <p className="text-white/60 text-sm">Téléphone</p>
                            <p className="text-white font-medium">{selectedRequest.phone}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <Briefcase className="w-5 h-5 text-huntzen-blue" />
                        <div>
                          <p className="text-white/60 text-sm">Secteur / Expérience</p>
                          <p className="text-white font-medium">{selectedRequest.sector} - {selectedRequest.experience_level}</p>
                        </div>
                      </div>
                      {selectedRequest.preferred_date && (
                        <div className="flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-huntzen-blue" />
                          <div>
                            <p className="text-white/60 text-sm">Date préférée</p>
                            <p className="text-white font-medium">{formatDate(selectedRequest.preferred_date)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Message du candidat</h3>
                    <div className="bg-slate-800 rounded-lg p-4">
                      <p className="text-white/80 leading-relaxed">{selectedRequest.message}</p>
                    </div>
                  </div>

                  {/* Payment Info */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Informations paiement</h3>
                    <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-white/60">Montant</span>
                        <span className="text-white font-bold">{formatAmount(selectedRequest.amount_cents)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Statut paiement</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_STATUS_COLORS[selectedRequest.payment_status]}`}>
                          {selectedRequest.payment_status}
                        </span>
                      </div>
                      {selectedRequest.payment_intent_id && (
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Payment Intent ID</span>
                          <span className="text-white/40 font-mono text-xs">{selectedRequest.payment_intent_id}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Statut de la demande</h3>
                    <div className="bg-slate-800 rounded-lg p-4">
                      <select
                        value={selectedRequest.status}
                        onChange={(e) => updateRequestStatus(selectedRequest.id, e.target.value as RequestStatus)}
                        className="w-full px-4 py-2 bg-slate-700 border border-white/10 rounded-lg text-white focus:outline-none focus:border-huntzen-blue"
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
  )
}
