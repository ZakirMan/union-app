import type { Metadata, Viewport } from "next"; // Добавьте Viewport в импорт
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react"; // <--- 1. ДОБАВИЛИ ИМПОРТ

const inter = Inter({ subsets: ["latin"] });

// 1. Настройка метаданных и PWA
export const metadata: Metadata = {
  title: "Профсоюз Работников Авиации Казахстана",
  description: "Приложение для членов профсоюза",
  manifest: "/manifest.json", // <-- Ссылка на манифест
  icons: {
    apple: "/icon-192.png", // Иконка для iPhone
  },
};

// 2. Настройка поведения на мобилках (чтобы не было зума и статус-бар был красивым)
export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Запрет зума (ощущение нативного приложения)
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        {children}
        <Analytics /> {/* <--- 2. ДОБАВИЛИ СЧЕТЧИК СЮДА */}
      </body>
    </html>
  );
}