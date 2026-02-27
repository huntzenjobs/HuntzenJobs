#!/usr/bin/env node
/**
 * sync-translations.mjs
 *
 * Reads fr.json (source of truth), finds missing keys in en/es/pt JSON files,
 * calls DeepL API (with MyMemory fallback) to translate them, then writes back.
 *
 * Usage (from project root):
 *   DEEPL_API_KEY=your-key node scripts/sync-translations.mjs
 *
 * Usage (from frontend-next/):
 *   npm run sync-translations
 *
 * Without DEEPL_API_KEY: falls back to MyMemory (free, 1000 words/day)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MESSAGES_DIR = join(__dirname, "../frontend-next/messages");
const TARGET_LOCALES = ["en", "es", "pt"];

const DEEPL_LANG_MAP = {
  en: "EN-GB",
  es: "ES",
  pt: "PT-BR",
};

const ISO_LANG_MAP = {
  en: "en",
  es: "es",
  pt: "pt",
};

// ============================================================================
// Helpers: flatten / unflatten nested JSON
// ============================================================================

function flatten(obj, prefix = "") {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function setNested(obj, path, value) {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current) || typeof current[keys[i]] !== "object") {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

// ============================================================================
// DeepL API
// ============================================================================

async function translateBatchDeepL(texts, targetLang) {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error("DEEPL_API_KEY not set");

  const response = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: texts,
      target_lang: DEEPL_LANG_MAP[targetLang],
      source_lang: "FR",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepL ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.translations.map((t) => t.text);
}

// ============================================================================
// MyMemory API (free fallback, no key needed)
// ============================================================================

async function translateMyMemory(text, targetLang) {
  const langPair = `fr|${ISO_LANG_MAP[targetLang]}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`MyMemory ${response.status}`);

  const data = await response.json();
  if (data.responseStatus !== 200) {
    throw new Error(`MyMemory: ${data.responseDetails}`);
  }

  return data.responseData.translatedText;
}

async function translateBatchMyMemory(texts, targetLang) {
  const results = [];
  for (let i = 0; i < texts.length; i++) {
    try {
      const translated = await translateMyMemory(texts[i], targetLang);
      results.push(translated);
      process.stdout.write(
        `\r  MyMemory: ${i + 1}/${texts.length} strings...`
      );
      // Rate-limit: 200ms between requests to avoid 429
      if (i < texts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (err) {
      console.warn(`\n  ⚠ MyMemory failed for string ${i + 1}: ${err.message}`);
      results.push(texts[i]); // Keep original as last resort
    }
  }
  process.stdout.write("\n");
  return results;
}

// ============================================================================
// Translate batch with DeepL → MyMemory fallback
// ============================================================================

async function translateBatch(texts, targetLang) {
  if (texts.length === 0) return [];

  // Try DeepL first (batch, fast)
  if (process.env.DEEPL_API_KEY) {
    try {
      const results = await translateBatchDeepL(texts, targetLang);
      console.log(`  ✓ DeepL translated ${texts.length} strings`);
      return results;
    } catch (err) {
      console.warn(`  ⚠ DeepL failed: ${err.message}`);
      console.warn("  → Falling back to MyMemory...");
    }
  } else {
    console.warn("  ⚠ No DEEPL_API_KEY — using MyMemory fallback");
  }

  // Fallback: MyMemory (sequential, rate-limited)
  return translateBatchMyMemory(texts, targetLang);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("🔄 sync-translations.mjs — Syncing missing i18n keys\n");
  console.log(`📁 Messages directory: ${MESSAGES_DIR}\n`);

  if (!existsSync(MESSAGES_DIR)) {
    console.error(`❌ Messages directory not found: ${MESSAGES_DIR}`);
    process.exit(1);
  }

  // Load source of truth (fr.json)
  const frPath = join(MESSAGES_DIR, "fr.json");
  if (!existsSync(frPath)) {
    console.error(`❌ fr.json not found: ${frPath}`);
    process.exit(1);
  }

  const frJson = JSON.parse(readFileSync(frPath, "utf8"));
  const frFlat = flatten(frJson);
  const totalKeys = Object.keys(frFlat).length;
  console.log(`📖 Source fr.json: ${totalKeys} keys\n`);

  let totalTranslated = 0;

  for (const locale of TARGET_LOCALES) {
    const targetPath = join(MESSAGES_DIR, `${locale}.json`);

    // Load target locale (or start from empty if missing)
    let targetJson = {};
    if (existsSync(targetPath)) {
      targetJson = JSON.parse(readFileSync(targetPath, "utf8"));
    } else {
      console.warn(`  ⚠ ${locale}.json not found — will create from scratch`);
    }

    const targetFlat = flatten(targetJson);

    // Find missing keys (keys in fr.json but not in target)
    const missingKeys = Object.keys(frFlat).filter(
      (key) => !(key in targetFlat) && typeof frFlat[key] === "string"
    );

    if (missingKeys.length === 0) {
      console.log(`✅ ${locale}.json — All ${totalKeys} keys present, nothing to do\n`);
      continue;
    }

    console.log(
      `🌍 ${locale}.json — ${missingKeys.length} missing keys out of ${totalKeys}:`
    );

    const textsToTranslate = missingKeys.map((key) => frFlat[key]);

    // Translate in batches of 50 (DeepL max per request)
    const BATCH_SIZE = 50;
    const allTranslated = [];

    for (let i = 0; i < textsToTranslate.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(textsToTranslate.length / BATCH_SIZE);
      const batch = textsToTranslate.slice(i, i + BATCH_SIZE);
      console.log(
        `  Batch ${batchNum}/${totalBatches} (${batch.length} strings)...`
      );
      const translated = await translateBatch(batch, locale);
      allTranslated.push(...translated);
    }

    // Merge translated values into target JSON
    for (let i = 0; i < missingKeys.length; i++) {
      setNested(targetJson, missingKeys[i], allTranslated[i]);
    }

    // Write back with consistent formatting
    writeFileSync(
      targetPath,
      JSON.stringify(targetJson, null, 2) + "\n",
      "utf8"
    );

    totalTranslated += missingKeys.length;
    console.log(
      `  ✅ Wrote ${missingKeys.length} new translations to ${locale}.json\n`
    );
  }

  if (totalTranslated > 0) {
    console.log(`🎉 Done! Added ${totalTranslated} translations across ${TARGET_LOCALES.length} locales.\n`);
  } else {
    console.log("🎉 Done! All locale files are already up to date.\n");
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
