import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Series = {
  key: string;
  color: string;
};

type Props<T> = {
  data: T[];
  xKey: string;
  series: Series[];
  yDomain?: [number, number];
};

export default function ChartComponent<T extends Record<string, unknown>>({ data, xKey, series, yDomain }: Props<T>) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey={xKey} />
        <YAxis domain={yDomain} />
        <Tooltip />
        {series.map((item) => (
          <Line key={item.key} type="monotone" dataKey={item.key} stroke={item.color} strokeWidth={3} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
