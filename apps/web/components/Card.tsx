import { ReactNode } from "react";
import clsx from "clsx";

type Props = {
  children: ReactNode;
  className?: string;
  id?: string;
};

export default function Card({ children, className, id }: Props) {
  return (
    <div
      id={id}
      className={clsx(
        "rounded-2xl border border-slate-200/60 bg-card p-6 shadow-soft",
        "dark:border-slate-700 dark:bg-card dark:shadow-none",
        className
      )}
    >
      {children}
    </div>
  );
}
