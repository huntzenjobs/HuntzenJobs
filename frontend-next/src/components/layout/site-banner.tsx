import { X } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "";

const TYPE_STYLES: Record<string, string> = {
  info: "bg-blue-600 text-white",
  warning: "bg-amber-500 text-white",
  error: "bg-red-600 text-white",
  success: "bg-emerald-600 text-white",
};

async function getBanner(): Promise<{ active: boolean; text?: string; type?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/banner`, { next: { revalidate: 60 } });
    if (!res.ok) return { active: false };
    return res.json();
  } catch {
    return { active: false };
  }
}

export default async function SiteBanner() {
  const banner = await getBanner();
  if (!banner.active || !banner.text) return null;

  const style = TYPE_STYLES[banner.type || "info"];

  return (
    <div className={`w-full text-center text-sm py-2 px-4 font-medium ${style}`}>
      {banner.text}
    </div>
  );
}
