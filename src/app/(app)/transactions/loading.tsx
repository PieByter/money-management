import { Skeleton } from '@/components/ui/skeleton';

export default function TransactionsLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-11 rounded-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-64 rounded-2xl" />
    </div>
  );
}
