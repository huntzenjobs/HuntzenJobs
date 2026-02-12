import { Metadata } from "next";
import { salonsMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = salonsMetadata;

export default function SalonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
