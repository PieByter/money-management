import { Skeleton } from '@/components/ui/skeleton';

export default function WalletsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}
