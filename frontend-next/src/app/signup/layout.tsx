import type { Metadata } from "next";
import { signupMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = signupMetadata;

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
