import { Metadata } from "next";
import { pricingMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pricingMetadata;

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
