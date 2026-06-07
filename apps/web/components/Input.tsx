import { InputHTMLAttributes } from "react";
import clsx from "clsx";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export default function Input({ label, className, ...props }: Props) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm text-textSecondary">
      {label}
      <input
        className={clsx(
          "w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-textPrimary outline-none focus:border-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500",
          className
        )}
        {...props}
      />
    </label>
  );
}
