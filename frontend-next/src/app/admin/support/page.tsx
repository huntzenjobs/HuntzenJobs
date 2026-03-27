import { SupportTicketsTable } from "@/components/admin/support/support-tickets-table";

export default function AdminSupportPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gérez les tickets support et répondez aux utilisateurs.
        </p>
      </div>
      <SupportTicketsTable />
    </div>
  );
}
