/**
 * POST /api/translate
 *
 * Translate dynamic content (Supabase data, user-generated content).
 * Uses Translation Memory cascade: Supabase TM → DeepL → Azure.
 *
 * Body: { text: string | string[], targetLang: 'en' | 'es' | 'pt', sourceLang?: 'fr' }
 * Returns: { translated: string | string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { translateText, translateBatch } from "@/lib/translation-service";

type Locale = "fr" | "en" | "es" | "pt";
const SUPPORTED_LOCALES: Locale[] = ["fr", "en", "es", "pt"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, targetLang, sourceLang = "fr" } = body;

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    if (!SUPPORTED_LOCALES.includes(targetLang)) {
      return NextResponse.json(
        { error: `targetLang must be one of: ${SUPPORTED_LOCALES.join(", ")}` },
        { status: 400 },
      );
    }

    if (Array.isArray(text)) {
      const translated = await translateBatch(text, targetLang, sourceLang);
      return NextResponse.json({ translated });
    }

    const translated = await translateText(text, targetLang, sourceLang);
    return NextResponse.json({ translated });
  } catch (err) {
    console.error("[/api/translate] Error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
