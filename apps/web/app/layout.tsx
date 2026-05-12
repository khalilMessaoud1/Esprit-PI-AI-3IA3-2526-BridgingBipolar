import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import MouseTrackerProvider from "./MouseTrackerProvider";
import BrightnessRoot from "../components/BrightnessRoot";
import { AuthProvider } from "../hooks/useAuth";
import LanguageSync from "../components/LanguageSync";

const manrope = Manrope({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "BridgingBipolar",
  description: "Clinically-informed bipolar disorder tracking platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={manrope.className}>
        <BrightnessRoot>
          <MouseTrackerProvider>
            <AuthProvider>
              <LanguageSync />
              {children}
            </AuthProvider>
          </MouseTrackerProvider>
        </BrightnessRoot>
      </body>
    </html>
  );
}
