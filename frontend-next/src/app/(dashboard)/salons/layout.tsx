import { Metadata } from "next";
import { getLocalizedMetadata, salonsMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(salonsMetadata, "salons");
}

export default function SalonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
