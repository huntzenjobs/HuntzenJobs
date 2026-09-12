import { Metadata } from "next";
import { getLocalizedMetadata, privacyMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(privacyMetadata, "privacy");
}

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
