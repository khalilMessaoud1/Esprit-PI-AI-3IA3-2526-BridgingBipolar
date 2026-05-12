type Props = {
  current: number;
  total: number;
};

export default function Progress({ current, total }: Props) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className="space-y-2">
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-textSecondary">
        Question {current} of {total}
      </p>
    </div>
  );
}
