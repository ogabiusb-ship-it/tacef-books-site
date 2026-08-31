import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"TACEF Books — 2026/2027",description:"Read the complete TACEF 2026/2027 manuals and Information Packs in an interactive digital book.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
