import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function JobsLoading() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton */}
      <Skeleton className="h-32 rounded-2xl" />

      {/* Search form skeleton */}
      <Card className="p-8">
        <Skeleton className="h-48 w-full" />
      </Card>

      {/* Jobs grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
