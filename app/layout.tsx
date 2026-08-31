import type { Metadata } from "next";
import "./globals.css";
const basePath=process.env.NEXT_PUBLIC_BASE_PATH??"";
export const metadata:Metadata={title:"TACEF Books",description:"Read the complete TACEF 2026/2027 manuals and Information Packs in an interactive digital book.",icons:{icon:{url:`${basePath}/tacef-favicon.png`,type:"image/png"},shortcut:`${basePath}/tacef-favicon.png`,apple:`${basePath}/tacef-favicon.png`}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
