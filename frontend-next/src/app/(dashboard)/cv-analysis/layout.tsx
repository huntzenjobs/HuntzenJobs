import { Metadata } from "next";
import { cvAnalysisMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = cvAnalysisMetadata;

export default function CVAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
