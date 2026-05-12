import { ReactNode } from "react";
import SettingsShell from "../../components/SettingsShell";

type Props = {
  children: ReactNode;
};

export default function SettingsLayout({ children }: Props) {
  return <SettingsShell>{children}</SettingsShell>;
}
