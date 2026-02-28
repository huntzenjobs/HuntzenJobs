import UsersTable from '@/components/admin/users/users-table'

export const metadata = {
  title: 'Utilisateurs — Admin Huntzen',
}

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestion des utilisateurs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Voir, suspendre, supprimer et gérer les abonnements de tous les utilisateurs.
        </p>
      </div>
      <UsersTable />
    </div>
  )
}
