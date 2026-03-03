/**
 * Translation Memory Service
 *
 * Cascade: Supabase TM → DeepL Free → Microsoft Azure Translator
 * Every translation is saved permanently — zero cost on future calls.
 */

import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

type Locale = "fr" | "en" | "es" | "pt";

// DeepL language code mapping
const DEEPL_LANG_MAP: Record<Locale, string> = {
  fr: "FR",
  en: "EN-GB",
  es: "ES",
  pt: "PT-BR",
};

// ISO 639-1 language codes (used by MyMemory and other APIs)
const ISO_LANG_MAP: Record<Locale, string> = {
  fr: "fr",
  en: "en",
  es: "es",
  pt: "pt",
};

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Translate a single text string.
 * Checks Supabase TM cache first, falls back to DeepL, then Azure.
 * Saves every new translation to TM for future reuse.
 */
export async function translateText(
  text: string,
  targetLang: Locale,
  sourceLang: Locale = "fr",
): Promise<string> {
  if (!text.trim()) return text;
  if (targetLang === sourceLang) return text;

  const hash = hashText(text);
  const supabase = await createClient();

  // 1. Check Supabase Translation Memory first
  const { data: cached } = await supabase
    .from("translation_memory")
    .select("translated_text")
    .eq("content_hash", hash)
    .eq("target_lang", targetLang)
    .single();

  if (cached) {
    // Increment usage counter asynchronously (fire and forget)
    supabase
      .from("translation_memory")
      .update({
        usage_count: supabase.rpc("increment_tm_usage", {
          hash,
          lang: targetLang,
        }),
      })
      .eq("content_hash", hash)
      .eq("target_lang", targetLang)
      .then(() => {});

    return cached.translated_text;
  }

  // 2. Try DeepL Free API
  let translated: string | null = null;
  let provider: "deepl" | "azure" = "deepl";

  try {
    translated = await translateWithDeepL(text, targetLang, sourceLang);
  } catch {
    // DeepL failed (quota exceeded or unavailable) — try MyMemory
  }

  // 3. Fallback to MyMemory (gratuit, zéro inscription)
  if (!translated) {
    try {
      translated = await translateWithMyMemory(text, targetLang, sourceLang);
      provider = "azure"; // on garde "azure" comme label générique pour le TM
    } catch (err) {
      console.error("[TranslationService] All providers failed:", err);
      return text; // Return original text as last resort
    }
  }

  if (!translated) return text;

  // 4. Save to Supabase Translation Memory (fire and forget)
  supabase
    .from("translation_memory")
    .insert({
      content_hash: hash,
      source_lang: sourceLang,
      target_lang: targetLang,
      source_text: text,
      translated_text: translated,
      provider,
    })
    .then(() => {});

  return translated;
}

/**
 * Translate multiple texts in a single API call (batch).
 * More efficient than calling translateText() in a loop.
 */
export async function translateBatch(
  texts: string[],
  targetLang: Locale,
  sourceLang: Locale = "fr",
): Promise<string[]> {
  if (targetLang === sourceLang) return texts;

  const supabase = await createClient();
  const results: string[] = new Array(texts.length);
  const toTranslate: Array<{ index: number; text: string; hash: string }> = [];

  // Check TM cache for all texts at once
  const hashes = texts.map(hashText);
  const { data: cached } = await supabase
    .from("translation_memory")
    .select("content_hash, translated_text")
    .in("content_hash", hashes)
    .eq("target_lang", targetLang);

  const cacheMap = new Map(
    cached?.map((r) => [r.content_hash, r.translated_text]) ?? [],
  );

  for (let i = 0; i < texts.length; i++) {
    if (cacheMap.has(hashes[i])) {
      results[i] = cacheMap.get(hashes[i])!;
    } else {
      toTranslate.push({ index: i, text: texts[i], hash: hashes[i] });
    }
  }

  if (toTranslate.length === 0) return results;

  // Batch translate uncached texts
  let translations: string[] | null = null;
  let provider: "deepl" | "azure" = "deepl";

  try {
    translations = await translateBatchWithDeepL(
      toTranslate.map((t) => t.text),
      targetLang,
      sourceLang,
    );
  } catch {
    // DeepL failed — try MyMemory
  }

  if (!translations) {
    try {
      translations = await translateBatchWithMyMemory(
        toTranslate.map((t) => t.text),
        targetLang,
        sourceLang,
      );
      provider = "azure"; // label générique
    } catch (err) {
      console.warn(
        "[TranslationService] Batch translation failed, using originals:",
        err,
      );
      // Fill remaining with originals
      for (const { index, text } of toTranslate) {
        results[index] = text;
      }
      return results;
    }
  }

  if (!translations) return results;

  // Fill results and save to TM
  const inserts = toTranslate.map((item, i) => ({
    content_hash: item.hash,
    source_lang: sourceLang,
    target_lang: targetLang,
    source_text: item.text,
    translated_text: translations![i],
    provider,
  }));

  for (let i = 0; i < toTranslate.length; i++) {
    results[toTranslate[i].index] = translations[i];
  }

  // Save all to TM (fire and forget)
  supabase
    .from("translation_memory")
    .upsert(inserts, { onConflict: "content_hash,target_lang" })
    .then(() => {});

  return results;
}

// ============================================================================
// DeepL API
// ============================================================================

async function translateWithDeepL(
  text: string,
  targetLang: Locale,
  sourceLang: Locale,
): Promise<string> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error("DEEPL_API_KEY not configured");

  const response = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      target_lang: DEEPL_LANG_MAP[targetLang],
      source_lang: DEEPL_LANG_MAP[sourceLang].split("-")[0],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `DeepL API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data.translations[0].text;
}

async function translateBatchWithDeepL(
  texts: string[],
  targetLang: Locale,
  sourceLang: Locale,
): Promise<string[]> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error("DEEPL_API_KEY not configured");

  const response = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: texts,
      target_lang: DEEPL_LANG_MAP[targetLang],
      source_lang: DEEPL_LANG_MAP[sourceLang].split("-")[0],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.status}`);
  }

  const data = await response.json();
  return data.translations.map((t: { text: string }) => t.text);
}

// ============================================================================
// MyMemory API (backup gratuit, zéro inscription)
// https://mymemory.translated.net — 1000 mots/jour sans clé
// ============================================================================

async function translateWithMyMemory(
  text: string,
  targetLang: Locale,
  sourceLang: Locale,
): Promise<string> {
  const langPair = `${ISO_LANG_MAP[sourceLang]}|${ISO_LANG_MAP[targetLang]}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 429) {
      // Rate limit hit — return original text silently (expected, not an error)
      return text;
    }
    throw new Error(`MyMemory API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.responseStatus !== 200) {
    throw new Error(`MyMemory translation failed: ${data.responseDetails}`);
  }

  return data.responseData.translatedText;
}

async function translateBatchWithMyMemory(
  texts: string[],
  targetLang: Locale,
  sourceLang: Locale,
): Promise<string[]> {
  // MyMemory n'a pas d'endpoint batch — on parallélise les requêtes
  const results = await Promise.all(
    texts.map((text) => translateWithMyMemory(text, targetLang, sourceLang)),
  );
  return results;
}
