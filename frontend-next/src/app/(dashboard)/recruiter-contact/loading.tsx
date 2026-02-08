import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function RecruiterContactLoading() {
  return (
    <div className="space-y-8">
      {/* Hero skeleton */}
      <div className="bg-gradient-to-br from-blue-100 to-cyan-100 rounded-3xl p-12">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-16 w-full mb-4" />
        <Skeleton className="h-6 w-3/4 mb-8" />
        <div className="flex gap-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-12 w-48" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-6 animate-pulse">
            <Skeleton className="h-12 w-24 mx-auto mb-2" />
            <Skeleton className="h-4 w-full" />
          </Card>
        ))}
      </div>

      {/* Form skeleton */}
      <Card className="p-8">
        <Skeleton className="h-96 w-full" />
      </Card>
    </div>
  )
}
