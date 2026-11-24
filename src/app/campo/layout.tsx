import type { Metadata, Viewport } from "next";

/**
 * /campo va aparte del CRM (sin menú ni barra lateral): es la app que el
 * trabajador instala en el celular para registrar labores sin señal.
 */
export const metadata: Metadata = {
  title: "Labores Finca",
  manifest: "/campo.webmanifest",
  appleWebApp: { capable: true, title: "Labores Finca", statusBarStyle: "black-translucent" },
  icons: { apple: "/brand/campo-apple.png" },
};

export const viewport: Viewport = {
  themeColor: "#241002",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
