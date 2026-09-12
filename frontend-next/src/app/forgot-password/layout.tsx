import type { Metadata } from "next";
import {
  forgotPasswordMetadata,
  getLocalizedMetadata,
} from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(forgotPasswordMetadata, "forgotPassword");
}

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
