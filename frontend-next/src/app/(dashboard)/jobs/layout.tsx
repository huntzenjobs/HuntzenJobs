import { Metadata } from "next";
import { jobsMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = jobsMetadata;

export default function JobsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
