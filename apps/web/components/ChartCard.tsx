import { ReactNode } from "react";
import Card from "./Card";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function ChartCard({ title, subtitle, children }: Props) {
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-textPrimary">{title}</h3>
        {subtitle && <p className="text-sm text-textSecondary">{subtitle}</p>}
      </div>
      <div className="h-64">{children}</div>
    </Card>
  );
}
