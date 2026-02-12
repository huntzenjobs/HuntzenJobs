import { Metadata } from "next";
import { assistantMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = assistantMetadata;

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
