import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function CVAnalysisLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="mb-8">
        <Skeleton className="h-10 w-2/3 mb-3" />
        <Skeleton className="h-5 w-1/2" />
      </div>

      {/* Upload card skeleton */}
      <Card className="p-8">
        <Skeleton className="h-64 w-full" />
      </Card>

      {/* Info cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-6 animate-pulse">
            <Skeleton className="h-12 w-12 rounded-full mb-3" />
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full" />
          </Card>
        ))}
      </div>
    </div>
  )
}
