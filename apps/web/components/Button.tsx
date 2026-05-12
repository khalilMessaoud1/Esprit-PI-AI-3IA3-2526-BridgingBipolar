import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export default function Button({ variant = "primary", className, type = "button", ...props }: Props) {
  const base = "rounded-xl px-4 py-2 text-sm font-semibold transition";
  const variants = {
    primary: "bg-primary text-white hover:bg-secondary",
    secondary: "bg-white text-textPrimary shadow-soft hover:bg-background",
    ghost: "bg-transparent text-textPrimary hover:bg-background"
  };

  return <button type={type} className={clsx(base, variants[variant], className)} {...props} />;
}
