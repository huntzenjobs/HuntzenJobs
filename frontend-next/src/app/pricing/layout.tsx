import { Metadata } from "next";
import { getLocalizedMetadata, pricingMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(pricingMetadata, "pricing");
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
