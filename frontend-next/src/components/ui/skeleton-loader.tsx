/**
 * Skeleton loaders pour prévenir CLS pendant le chargement
 * Utilisé pour le contenu dynamique (jobs, CV, etc.)
 */

interface SkeletonProps {
  className?: string;
}

export function SkeletonText({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded h-4 ${className}`}
      role="status"
      aria-label="Chargement..."
    />
  );
}

export function SkeletonTitle({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded h-8 ${className}`}
      role="status"
      aria-label="Chargement..."
    />
  );
}

export function SkeletonAvatar({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded-full ${className}`}
      role="status"
      aria-label="Chargement..."
    />
  );
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-100 rounded-lg border border-gray-200 p-6 ${className}`}
      role="status"
      aria-label="Chargement..."
    >
      <div className="space-y-4">
        <SkeletonTitle className="w-3/4" />
        <SkeletonText className="w-full" />
        <SkeletonText className="w-5/6" />
        <div className="flex gap-2 mt-4">
          <div className="animate-pulse bg-gray-200 rounded-full h-8 w-20" />
          <div className="animate-pulse bg-gray-200 rounded-full h-8 w-24" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonImage({
  className = "",
  aspectRatio = "video",
}: SkeletonProps & { aspectRatio?: "square" | "video" | "portrait" }) {
  const aspectClass = {
    square: "aspect-square",
    video: "aspect-video",
    portrait: "aspect-[3/4]",
  }[aspectRatio];

  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${aspectClass} ${className}`}
      role="status"
      aria-label="Chargement de l'image..."
    />
  );
}

/**
 * Skeleton complet pour une liste d'offres d'emploi
 */
export function SkeletonJobList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton pour le dashboard
 */
export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <SkeletonTitle className="w-1/3 mb-2" />
        <SkeletonText className="w-1/2" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-gray-100 rounded-lg border border-gray-200 p-6"
          >
            <SkeletonText className="w-1/2 mb-4" />
            <div className="animate-pulse bg-gray-200 rounded h-12 w-1/3" />
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonJobList count={5} />
        </div>
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
