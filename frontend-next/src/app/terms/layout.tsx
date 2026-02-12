import { Metadata } from "next";
import { termsMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = termsMetadata;

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
