import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { theme } from "@/theme";
import { Shell } from "@/components/Shell";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = {
  title: "ReadMe",
  description: "私人关系与重要事项：记住重要的事，发现遗漏，用 AI 帮你理解和处理",
  applicationName: "ReadMe",
  appleWebApp: { capable: true, title: "ReadMe", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#141827" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        {/* bottom-bar glass strength (设置 → 通用) and a lighter look for low-memory phones, applied before paint so it never flashes */}
        <script dangerouslySetInnerHTML={{ __html: `try{var g=localStorage.getItem("radar-glass");if(g)document.documentElement.dataset.glass=g;var l=localStorage.getItem("radar.lang");if(l)document.documentElement.lang=l;var n=navigator,c=n.connection;if((n.deviceMemory&&n.deviceMemory<=3)||(c&&c.saveData))document.documentElement.dataset.lite=""}catch(e){}` }} />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          <Notifications position="top-center" limit={2} />
          <ClientOnly><Shell>{children}</Shell></ClientOnly>
        </MantineProvider>
      </body>
    </html>
  );
}
