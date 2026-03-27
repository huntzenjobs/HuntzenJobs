import type { Metadata } from "next";
import { forgotPasswordMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = forgotPasswordMetadata;

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
