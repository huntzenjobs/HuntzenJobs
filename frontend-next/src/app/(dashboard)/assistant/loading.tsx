import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function AssistantLoading() {
  return (
    <div className="space-y-6 h-[calc(100vh-200px)]">
      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="h-10 w-1/3 mb-3" />
        <Skeleton className="h-5 w-2/3" />
      </div>

      {/* Chat interface skeleton */}
      <Card className="flex-1 p-6">
        <div className="space-y-4 mb-6">
          {/* Message bubbles */}
          <div className="flex justify-end">
            <Skeleton className="h-16 w-3/4 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-24 w-3/4 rounded-2xl" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
          </div>
        </div>

        {/* Input skeleton */}
        <Skeleton className="h-12 w-full rounded-xl" />
      </Card>
    </div>
  )
}
