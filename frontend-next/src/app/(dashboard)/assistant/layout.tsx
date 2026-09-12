import { Metadata } from "next";
import { assistantMetadata, getLocalizedMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(assistantMetadata, "assistant");
}

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
