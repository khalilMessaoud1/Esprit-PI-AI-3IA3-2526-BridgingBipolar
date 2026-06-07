import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import MouseTrackerProvider from "./MouseTrackerProvider";
import BrightnessRoot from "../components/BrightnessRoot";
import ThemeInitScript from "../components/ThemeInitScript";
import { AuthProvider } from "../hooks/useAuth";
import { ThemeProvider } from "../hooks/useTheme";
import LanguageSync from "../components/LanguageSync";
import MedicationRemindersRoot from "../components/MedicationRemindersRoot";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "BridgingBipolar",
  description: "Clinically-informed bipolar disorder tracking platform",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <head>
        <ThemeInitScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Lato:wght@400;700&family=Merriweather:wght@400;700&family=Nunito:wght@400;600;700&family=Open+Sans:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <BrightnessRoot>
            <MouseTrackerProvider>
              <AuthProvider>
                <LanguageSync />
                <MedicationRemindersRoot />
                {children}
              </AuthProvider>
            </MouseTrackerProvider>
          </BrightnessRoot>
        </ThemeProvider>
      </body>
    </html>
  );
}
