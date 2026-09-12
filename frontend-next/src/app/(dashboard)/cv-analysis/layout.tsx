import { Metadata } from "next";
import { cvAnalysisMetadata, getLocalizedMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(cvAnalysisMetadata, "cvAnalysis");
}

export default function CVAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
