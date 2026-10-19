import { Skeleton } from '@/components/ui/skeleton';

export default function ItemsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-7 w-32" />
      </div>
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}
