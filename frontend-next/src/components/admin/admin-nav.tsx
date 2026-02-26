'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  Package,
  BarChart3,
  FileText,
  Gift,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    href: '/admin/users',
    label: 'Utilisateurs',
    icon: Users,
  },
  {
    href: '/admin/plans',
    label: 'Packages',
    icon: Package,
  },
  {
    href: '/admin/analytics',
    label: 'Revenue',
    icon: BarChart3,
  },
  {
    href: '/admin/logs',
    label: 'Logs',
    icon: FileText,
  },
  {
    href: '/admin/referrals',
    label: 'Parrainage',
    icon: Gift,
  },
]

export default function AdminNav() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen border-r bg-card flex flex-col shrink-0">
      <div className="p-4 border-b">
        <Link href="/admin/users" className="flex items-center gap-2 font-semibold text-sm">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span>Admin Panel</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t">
        <Link
          href="/jobs"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Retour app
        </Link>
      </div>
    </aside>
  )
}
