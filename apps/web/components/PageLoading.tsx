export default function PageLoading() {
  return (
    <div className="animate-pulse space-y-6 py-2">
      <div className="h-28 rounded-3xl bg-secondary/60" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-36 rounded-2xl bg-secondary/50" />
        <div className="h-36 rounded-2xl bg-secondary/50" />
        <div className="h-36 rounded-2xl bg-secondary/50" />
      </div>
      <div className="h-48 rounded-2xl bg-secondary/40" />
    </div>
  );
}
