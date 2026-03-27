/**
 * FAQ Data - Shared between Server and Client Components
 * Questions groupées par catégorie pour SEO et Featured Snippets
 *
 * Prices and limits are injected dynamically to stay in sync
 * with Supabase subscription_plans (admin panel).
 *
 * All user-facing text comes from i18n (namespace "faqData").
 */

export interface FaqParams {
  proPrice: string;
  freeCvLimit: number;
}

export function buildFaqCategories(
  params: FaqParams,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const { proPrice, freeCvLimit } = params;

  return [
    {
      category: t("categories.general.title"),
      questions: [
        {
          q: t("categories.general.q1"),
          a: t("categories.general.a1"),
        },
        {
          q: t("categories.general.q2"),
          a: t("categories.general.a2"),
        },
        {
          q: t("categories.general.q3"),
          a: t("categories.general.a3", {
            freeCvLimit,
            proPrice,
          }),
        },
        {
          q: t("categories.general.q4"),
          a: t("categories.general.a4"),
        },
      ],
    },
    {
      category: t("categories.cvAts.title"),
      questions: [
        {
          q: t("categories.cvAts.q1"),
          a: t("categories.cvAts.a1"),
        },
        {
          q: t("categories.cvAts.q2"),
          a: t("categories.cvAts.a2"),
        },
        {
          q: t("categories.cvAts.q3"),
          a: t("categories.cvAts.a3", {
            freeCvLimit,
          }),
        },
        {
          q: t("categories.cvAts.q4"),
          a: t("categories.cvAts.a4"),
        },
      ],
    },
    {
      category: t("categories.jobSearch.title"),
      questions: [
        {
          q: t("categories.jobSearch.q1"),
          a: t("categories.jobSearch.a1"),
        },
        {
          q: t("categories.jobSearch.q2"),
          a: t("categories.jobSearch.a2"),
        },
        {
          q: t("categories.jobSearch.q3"),
          a: t("categories.jobSearch.a3"),
        },
        {
          q: t("categories.jobSearch.q4"),
          a: t("categories.jobSearch.a4"),
        },
      ],
    },
    {
      category: t("categories.assistant.title"),
      questions: [
        {
          q: t("categories.assistant.q1"),
          a: t("categories.assistant.a1"),
        },
        {
          q: t("categories.assistant.q2"),
          a: t("categories.assistant.a2"),
        },
        {
          q: t("categories.assistant.q3"),
          a: t("categories.assistant.a3"),
        },
      ],
    },
    {
      category: t("categories.pricing.title"),
      questions: [
        {
          q: t("categories.pricing.q1"),
          a: t("categories.pricing.a1", {
            freeCvLimit,
            proPrice,
          }),
        },
        {
          q: t("categories.pricing.q2"),
          a: t("categories.pricing.a2"),
        },
        {
          q: t("categories.pricing.q3"),
          a: t("categories.pricing.a3"),
        },
      ],
    },
    {
      category: t("categories.support.title"),
      questions: [
        {
          q: t("categories.support.q1"),
          a: t("categories.support.a1"),
        },
        {
          q: t("categories.support.q2"),
          a: t("categories.support.a2"),
        },
        {
          q: t("categories.support.q3"),
          a: t("categories.support.a3"),
        },
      ],
    },
  ];
}
