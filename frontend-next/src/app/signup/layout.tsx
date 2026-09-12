import type { Metadata } from "next";
import { getLocalizedMetadata, signupMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(signupMetadata, "signup");
}

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
