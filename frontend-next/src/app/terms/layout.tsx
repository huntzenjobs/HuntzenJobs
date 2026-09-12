import { Metadata } from "next";
import { getLocalizedMetadata, termsMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(termsMetadata, "terms");
}

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
