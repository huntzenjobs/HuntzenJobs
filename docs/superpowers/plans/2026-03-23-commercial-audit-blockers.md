# Commercial Audit — Blockers Restants

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 5 items 🟠 bloquants de l'audit commercial avant mise en vente.

**Architecture:** Corrections chirurgicales sur 6 fichiers — aucune logique métier touchée, uniquement UI/i18n/logs.

**Tech Stack:** Next.js 14, next-intl (fr/en/es/pt), TypeScript, Sonner (toasts)

---

## Fichiers touchés

| Fichier | Modification |
|---|---|
| `frontend-next/src/hooks/use-authenticated-fetch.ts` | Gate `console.warn/error` avec `isDev` |
| `frontend-next/src/hooks/use-subscription-api.ts` | Gate `console.warn/error` avec `isDev` |
| `frontend-next/src/lib/feature-flags.ts` | Gate `console.group/log` avec `isDev` constant |
| `frontend-next/src/components/cv-builder/cv-builder-wizard.tsx` | Remplacer 9 strings FR hardcodées par `t()` |
| `frontend-next/src/app/admin/layout.tsx` | `"Admin — Huntzen"` → `"Admin — HuntZen"` |
| `frontend-next/messages/fr.json` | Ajouter clés wizard + corriger ACCÉLÉRATEUR + paymentError fallbacks |
| `frontend-next/messages/en.json` | Ajouter clés wizard + corriger ACCELERATOR + "Start with Pro" + paymentError fallbacks |
| `frontend-next/messages/es.json` | Ajouter clés wizard + corriger ACELERADOR + paymentError fallbacks |
| `frontend-next/messages/pt.json` | Ajouter clés wizard + corriger ACELERADOR + paymentError fallbacks |
| `frontend-next/src/components/freemium/pricing-modal.tsx` | Remplacer 2 strings EN hardcodées par `tModal()` |

---

## Task 1 — console.log sans isDev : use-authenticated-fetch.ts

**Fichiers :**
- Modifier : `frontend-next/src/hooks/use-authenticated-fetch.ts:57,84`

Les `console.warn` (ligne 57) et `console.error` (ligne 84) ne sont pas garded par `isDev` — ils s'affichent en prod et peuvent exposer des informations de session.

- [ ] **Step 1 : Gater console.warn ligne 57**

Remplacer :
```typescript
      if (response.status === 401 && !skipAuth) {
        console.warn(
          "[AuthenticatedFetch] Token expired (401), getting new token...",
        );
```
Par :
```typescript
      if (response.status === 401 && !skipAuth) {
        if (isDev)
          console.warn(
            "[AuthenticatedFetch] Token expired (401), getting new token...",
          );
```

- [ ] **Step 2 : Gater console.error ligne 84**

Remplacer :
```typescript
        if (retryResponse.status === 401) {
          console.error(
            "[AuthenticatedFetch] Still 401 after token refresh - session invalid",
          );
```
Par :
```typescript
        if (retryResponse.status === 401) {
          if (isDev)
            console.error(
              "[AuthenticatedFetch] Still 401 after token refresh - session invalid",
            );
```

- [ ] **Step 3 : Lint + type check**

```bash
cd frontend-next && npm run lint -- --max-warnings 0 src/hooks/use-authenticated-fetch.ts && npx tsc --noEmit
```
Expected : 0 erreurs

- [ ] **Step 4 : Commit**

```bash
git add frontend-next/src/hooks/use-authenticated-fetch.ts
git commit -m "fix(logs): gate console.warn/error with isDev in use-authenticated-fetch"
```

---

## Task 2 — console.log sans isDev : use-subscription-api.ts

**Fichiers :**
- Modifier : `frontend-next/src/hooks/use-subscription-api.ts:225,235,340,344`

4 appels `console.warn/error` non garded — exposent en prod des détails sur l'état du cache et les erreurs de fetch.

- [ ] **Step 1 : Gater console.warn ligne 225**

Remplacer :
```typescript
          console.warn(
            "[SubscriptionAPI] Token expired (401), getting new token...",
          );
```
Par :
```typescript
          if (isDev)
            console.warn(
              "[SubscriptionAPI] Token expired (401), getting new token...",
            );
```

- [ ] **Step 2 : Gater console.warn ligne 235**

Remplacer :
```typescript
              console.warn(
                "[SubscriptionAPI] Using persistent cache after token refresh failed",
              );
```
Par :
```typescript
              if (isDev)
                console.warn(
                  "[SubscriptionAPI] Using persistent cache after token refresh failed",
                );
```

- [ ] **Step 3 : Gater console.error ligne 340**

Remplacer :
```typescript
      console.error("[SubscriptionAPI] Fetch error:", error);
```
Par :
```typescript
      if (isDev) console.error("[SubscriptionAPI] Fetch error:", error);
```

- [ ] **Step 4 : Gater console.warn ligne 344**

Remplacer :
```typescript
        console.warn("[SubscriptionAPI] Using persistent cache as fallback");
```
Par :
```typescript
        if (isDev)
          console.warn("[SubscriptionAPI] Using persistent cache as fallback");
```

- [ ] **Step 5 : Lint + type check**

```bash
cd frontend-next && npm run lint -- --max-warnings 0 src/hooks/use-subscription-api.ts && npx tsc --noEmit
```

- [ ] **Step 6 : Commit**

```bash
git add frontend-next/src/hooks/use-subscription-api.ts
git commit -m "fix(logs): gate console.warn/error with isDev in use-subscription-api"
```

---

## Task 3 — console.log sans isDev : feature-flags.ts

**Fichiers :**
- Modifier : `frontend-next/src/lib/feature-flags.ts:290-326`

Les fonctions `logFeatureFlags` et `logRolloutConfig` ont des guards `NODE_ENV === "development"` mais n'utilisent pas la constante `isDev` déjà définie dans les autres fichiers. À aligner pour cohérence + clarté d'audit.

Note : les console calls sont déjà indirectement protégés. La correction est d'ajouter `const isDev` et de remplacer les vérifications inline.

- [ ] **Step 1 : Ajouter const isDev en haut du fichier**

Après la ligne `export const featureFlags = {`, dans la section des utilities (après ligne 140), ajouter AVANT `export const isFeatureEnabled` :

```typescript
const isDev = process.env.NODE_ENV === "development";
```

- [ ] **Step 2 : Simplifier logFeatureFlags**

Remplacer :
```typescript
export const logFeatureFlags = (): void => {
  if (!featureFlags.enableDebugMode) return;

  if (process.env.NODE_ENV === "development") {
    console.group("Feature Flags");
    console.table(featureFlags);
    console.groupEnd();
  }
};
```
Par :
```typescript
export const logFeatureFlags = (): void => {
  if (!isDev || !featureFlags.enableDebugMode) return;

  console.group("Feature Flags");
  console.table(featureFlags);
  console.groupEnd();
};
```

- [ ] **Step 3 : Simplifier logRolloutConfig**

Remplacer :
```typescript
export const logRolloutConfig = (userId: string): void => {
  if (process.env.NODE_ENV !== "development") return;
  if (!featureFlags.enableDebugMode) return;

  const phase = getCurrentPhase();

  if (process.env.NODE_ENV === "development") {
    console.group(`Rollout Configuration (Phase: ${phase})`);
    console.log("User ID:", userId);
    console.log(
      "Jobs V2:",
      shouldEnableForUser(userId, "jobsV2") ? "Enabled" : "Disabled",
    );
    console.log(
      "Coach V2:",
      shouldEnableForUser(userId, "coachV2") ? "Enabled" : "Disabled",
    );
    console.log(
      "CV Analysis V2:",
      shouldEnableForUser(userId, "cvAnalysisV2") ? "Enabled" : "Disabled",
    );
    console.groupEnd();
  }
};
```
Par :
```typescript
export const logRolloutConfig = (userId: string): void => {
  if (!isDev || !featureFlags.enableDebugMode) return;

  const phase = getCurrentPhase();

  console.group(`Rollout Configuration (Phase: ${phase})`);
  console.log("User ID:", userId);
  console.log(
    "Jobs V2:",
    shouldEnableForUser(userId, "jobsV2") ? "Enabled" : "Disabled",
  );
  console.log(
    "Coach V2:",
    shouldEnableForUser(userId, "coachV2") ? "Enabled" : "Disabled",
  );
  console.log(
    "CV Analysis V2:",
    shouldEnableForUser(userId, "cvAnalysisV2") ? "Enabled" : "Disabled",
  );
  console.groupEnd();
};
```

- [ ] **Step 4 : Lint + type check**

```bash
cd frontend-next && npm run lint -- --max-warnings 0 src/lib/feature-flags.ts && npx tsc --noEmit
```

- [ ] **Step 5 : Commit**

```bash
git add frontend-next/src/lib/feature-flags.ts
git commit -m "fix(logs): use isDev constant in feature-flags loggers"
```

---

## Task 4 — Branding admin/layout.tsx

**Fichiers :**
- Modifier : `frontend-next/src/app/admin/layout.tsx:7`

- [ ] **Step 1 : Corriger le title**

Remplacer :
```typescript
  title: "Admin — Huntzen",
```
Par :
```typescript
  title: "Admin — HuntZen",
```

- [ ] **Step 2 : Lint**

```bash
cd frontend-next && npm run lint -- --max-warnings 0 src/app/admin/layout.tsx
```

- [ ] **Step 3 : Commit**

```bash
git add frontend-next/src/app/admin/layout.tsx
git commit -m "fix(branding): Admin page title HuntZen casing"
```

---

## Task 5 — Incohérence plan ACCÉLÉRATEUR (messages)

**Fichiers :**
- Modifier : `frontend-next/messages/fr.json` (pricingModal.plans.pro.name)
- Modifier : `frontend-next/messages/en.json` (pricingModal.plans.pro.name + cta)
- Modifier : `frontend-next/messages/es.json` (pricingModal.plans.pro.name)
- Modifier : `frontend-next/messages/pt.json` (pricingModal.plans.pro.name)

Problème : `pricingModal.plans.pro.name` est en MAJUSCULES dans toutes les locales alors que le `display_name` en DB est en casse normale. Crée une incohérence visuelle si la clé statique est utilisée quelque part.

Bonus : en.json a `cta: "Start with Pro"` (nom technique) au lieu de `"Start with Accelerator"` (nom commercial).

- [ ] **Step 1 : Corriger fr.json**

Dans `pricingModal.plans.pro` :
```json
"name": "Accélérateur",
```
(était : `"ACCÉLÉRATEUR"`)

- [ ] **Step 2 : Corriger en.json**

Dans `pricingModal.plans.pro` :
```json
"name": "Accelerator",
"cta": "Start with Accelerator",
```
(étaient : `"ACCELERATOR"` et `"Start with Pro"`)

Également dans `pricing.plans.pro` (si présent) :
```json
"name": "Accelerator",
```
(était : `"Pro"` — vérifier ligne ~492)

- [ ] **Step 3 : Corriger es.json**

Dans `pricingModal.plans.pro` :
```json
"name": "Acelerador",
```
(était : `"ACELERADOR"`)

- [ ] **Step 4 : Corriger pt.json**

Dans `pricingModal.plans.pro` :
```json
"name": "Acelerador",
```
(était : `"ACELERADOR"`)

- [ ] **Step 5 : Lint i18n (sync check)**

```bash
cd frontend-next && npm run sync-translations
```
Expected : pas d'erreur de clé manquante

- [ ] **Step 6 : Commit**

```bash
git add frontend-next/messages/fr.json frontend-next/messages/en.json frontend-next/messages/es.json frontend-next/messages/pt.json
git commit -m "fix(i18n): normalize plan display names casing (ACCÉLÉRATEUR → Accélérateur)"
```

---

## Task 6 — CV Builder textes hardcodés FR

**Fichiers :**
- Modifier : `frontend-next/src/components/cv-builder/cv-builder-wizard.tsx`
- Modifier : `frontend-next/messages/fr.json` (cvBuilder.wizard)
- Modifier : `frontend-next/messages/en.json` (cvBuilder.wizard)
- Modifier : `frontend-next/messages/es.json` (cvBuilder.wizard)
- Modifier : `frontend-next/messages/pt.json` (cvBuilder.wizard)

Strings hardcodées FR à i18nifier (9 occurrences) :
| String | Clé i18n |
|---|---|
| `"Infos perso."`, `"Résumé"`, `"Expériences"`, `"Formation"`, `"Compétences"` (STEPS array) | `wizard.steps.personalInfo` … `wizard.steps.skills` |
| `"Créer un profil CV"` | `wizard.createTitle` |
| `"Modifier le profil CV"` | `wizard.editTitle` |
| `"Nom du profil :"` | `wizard.profileNameLabel` |
| `"Mon CV"` (default + fallback ×2) | `wizard.defaultProfileName` |
| `"Précédent"` | `wizard.prev` |
| `"Suivant"` | `wizard.next` |
| `"Sauvegarde..."` | `wizard.saving` |
| `"Sauvegarder le profil"` | `wizard.save` |

- [ ] **Step 1 : Ajouter les clés dans fr.json**

Dans `cvBuilder.wizard`, ajouter après `"profileNamePlaceholder"` :
```json
"wizard": {
  "profileNamePlaceholder": "Mon CV principal",
  "createTitle": "Créer un profil CV",
  "editTitle": "Modifier le profil CV",
  "profileNameLabel": "Nom du profil :",
  "defaultProfileName": "Mon CV",
  "steps": {
    "personalInfo": "Infos perso.",
    "summary": "Résumé",
    "experiences": "Expériences",
    "education": "Formation",
    "skills": "Compétences"
  },
  "prev": "Précédent",
  "next": "Suivant",
  "saving": "Sauvegarde...",
  "save": "Sauvegarder le profil"
}
```

- [ ] **Step 2 : Ajouter les clés dans en.json**

```json
"wizard": {
  "profileNamePlaceholder": "My main CV",
  "createTitle": "Create a CV profile",
  "editTitle": "Edit CV profile",
  "profileNameLabel": "Profile name:",
  "defaultProfileName": "My CV",
  "steps": {
    "personalInfo": "Personal info",
    "summary": "Summary",
    "experiences": "Experience",
    "education": "Education",
    "skills": "Skills"
  },
  "prev": "Previous",
  "next": "Next",
  "saving": "Saving...",
  "save": "Save profile"
}
```

- [ ] **Step 3 : Ajouter les clés dans es.json**

```json
"wizard": {
  "profileNamePlaceholder": "Mi CV principal",
  "createTitle": "Crear perfil de CV",
  "editTitle": "Editar perfil de CV",
  "profileNameLabel": "Nombre del perfil:",
  "defaultProfileName": "Mi CV",
  "steps": {
    "personalInfo": "Info personal",
    "summary": "Resumen",
    "experiences": "Experiencias",
    "education": "Formación",
    "skills": "Competencias"
  },
  "prev": "Anterior",
  "next": "Siguiente",
  "saving": "Guardando...",
  "save": "Guardar perfil"
}
```

- [ ] **Step 4 : Ajouter les clés dans pt.json**

```json
"wizard": {
  "profileNamePlaceholder": "Meu CV principal",
  "createTitle": "Criar perfil de CV",
  "editTitle": "Editar perfil de CV",
  "profileNameLabel": "Nome do perfil:",
  "defaultProfileName": "Meu CV",
  "steps": {
    "personalInfo": "Informações pessoais",
    "summary": "Resumo",
    "experiences": "Experiências",
    "education": "Formação",
    "skills": "Competências"
  },
  "prev": "Anterior",
  "next": "Próximo",
  "saving": "Salvando...",
  "save": "Salvar perfil"
}
```

- [ ] **Step 5 : Mettre à jour cv-builder-wizard.tsx**

Remplacer le tableau `STEPS` statique :
```typescript
const STEPS = [
  { label: "Infos perso.", short: "1" },
  { label: "Résumé", short: "2" },
  { label: "Expériences", short: "3" },
  { label: "Formation", short: "4" },
  { label: "Compétences", short: "5" },
];
```
Par une fonction qui utilise les traductions (à l'intérieur du composant, après `const t = useTranslations("cvBuilder.wizard")`) :
```typescript
const STEPS = [
  { label: t("steps.personalInfo"), short: "1" },
  { label: t("steps.summary"), short: "2" },
  { label: t("steps.experiences"), short: "3" },
  { label: t("steps.education"), short: "4" },
  { label: t("steps.skills"), short: "5" },
];
```

⚠️ Déplacer `STEPS` de la portée module vers l'intérieur du composant (après `const t = ...`), puisqu'il dépend maintenant de `t()`.

Remplacer `initialName = "Mon CV"` dans la signature :
```typescript
  initialName,
  onSave,
}: CvBuilderWizardProps) {
  const t = useTranslations("cvBuilder.wizard");
  const defaultName = t("defaultProfileName");
  const [step, setStep] = useState(0);
  const [profileName, setProfileName] = useState(initialName ?? defaultName);
```

Remplacer le fallback `"Mon CV"` dans handleSave :
```typescript
      await onSave(profileName.trim() || t("defaultProfileName"), formData);
```

Remplacer les strings JSX :
```typescript
// ligne ~153 :
{initialData ? t("editTitle") : t("createTitle")}

// ligne ~162 :
<Label ...>{t("profileNameLabel")}</Label>

// ligne ~251 :
<Button ... onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
  {t("prev")}
</Button>

// ligne ~261 :
<Button ... onClick={() => setStep((s) => s + 1)} ...>
  {t("next")}
</Button>

// lignes ~271-276 :
{saving ? (
  <>
    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
    {t("saving")}
  </>
) : (
  t("save")
)}
```

Mettre à jour l'interface `CvBuilderWizardProps` — `initialName` devient optionnel sans valeur par défaut dans la signature de déstructuration :
```typescript
export interface CvBuilderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Partial<CvData>;
  initialName?: string;  // optionnel, fallback = t("defaultProfileName")
  onSave: (name: string, data: CvData) => Promise<void>;
}
```

- [ ] **Step 6 : Lint + type check**

```bash
cd frontend-next && npm run lint -- --max-warnings 0 src/components/cv-builder/cv-builder-wizard.tsx && npx tsc --noEmit
```

- [ ] **Step 7 : Sync translations**

```bash
cd frontend-next && npm run sync-translations
```

- [ ] **Step 8 : Commit**

```bash
git add frontend-next/src/components/cv-builder/cv-builder-wizard.tsx \
        frontend-next/messages/fr.json \
        frontend-next/messages/en.json \
        frontend-next/messages/es.json \
        frontend-next/messages/pt.json
git commit -m "fix(i18n): cv-builder wizard strings — remove hardcoded FR, use next-intl"
```

---

## Task 7 — pricingModal.toasts.paymentError strings hardcodées EN

**Fichiers :**
- Modifier : `frontend-next/src/components/freemium/pricing-modal.tsx:175,208`
- Modifier : `frontend-next/messages/fr.json` (pricingModal.toasts)
- Modifier : `frontend-next/messages/en.json` (pricingModal.toasts)
- Modifier : `frontend-next/messages/es.json` (pricingModal.toasts)
- Modifier : `frontend-next/messages/pt.json` (pricingModal.toasts)

Deux strings EN hardcodées qui atterrissent dans le message d'erreur affiché à l'utilisateur via `toast.error(message)` au moment critique du paiement :
- Ligne 175 : `"Failed to create checkout session"` (fallback de `data.detail`)
- Ligne 208 : `"No checkout URL returned"`

- [ ] **Step 1 : Ajouter les clés i18n dans fr.json**

Dans `pricingModal.toasts`, ajouter :
```json
"checkoutFailed": "Impossible de créer la session de paiement",
"noCheckoutUrl": "URL de paiement manquante — veuillez réessayer"
```

- [ ] **Step 2 : Ajouter les clés dans en.json**

```json
"checkoutFailed": "Failed to create checkout session",
"noCheckoutUrl": "No checkout URL returned — please try again"
```

- [ ] **Step 3 : Ajouter les clés dans es.json**

```json
"checkoutFailed": "No se pudo crear la sesión de pago",
"noCheckoutUrl": "URL de pago no disponible — inténtalo de nuevo"
```

- [ ] **Step 4 : Ajouter les clés dans pt.json**

```json
"checkoutFailed": "Não foi possível criar a sessão de pagamento",
"noCheckoutUrl": "URL de pagamento indisponível — tente novamente"
```

- [ ] **Step 5 : Mettre à jour pricing-modal.tsx**

Ligne 175 — remplacer :
```typescript
        const detail: string =
          data.detail || "Failed to create checkout session";
```
Par :
```typescript
        const detail: string =
          data.detail || tModal("toasts.checkoutFailed");
```

Ligne 208 — remplacer :
```typescript
        throw new Error("No checkout URL returned");
```
Par :
```typescript
        throw new Error(tModal("toasts.noCheckoutUrl"));
```

- [ ] **Step 6 : Lint + type check**

```bash
cd frontend-next && npm run lint -- --max-warnings 0 src/components/freemium/pricing-modal.tsx && npx tsc --noEmit
```

- [ ] **Step 7 : Commit**

```bash
git add frontend-next/src/components/freemium/pricing-modal.tsx \
        frontend-next/messages/fr.json \
        frontend-next/messages/en.json \
        frontend-next/messages/es.json \
        frontend-next/messages/pt.json
git commit -m "fix(i18n): pricing-modal payment error strings — remove hardcoded EN fallbacks"
```

---

## Task 8 — Vérification finale + PR

- [ ] **Step 1 : Build complet**

```bash
cd frontend-next && npm run build
```
Expected : 0 erreurs TypeScript, 0 warnings bloquants

- [ ] **Step 2 : Tests**

```bash
cd frontend-next && npm run test:run
```
Expected : tous les tests passent

- [ ] **Step 3 : Créer la PR**

```bash
git push origin Production
gh pr create \
  --title "fix: commercial audit blockers — logs/i18n/branding" \
  --body "## Changements\n\n- fix(logs): gate console.warn/error prod dans use-authenticated-fetch, use-subscription-api, feature-flags\n- fix(branding): Admin title HuntZen casing\n- fix(i18n): cv-builder wizard 9 strings FR hardcodées → next-intl (fr/en/es/pt)\n- fix(i18n): plan names ACCÉLÉRATEUR → Accélérateur dans pricingModal (fr/en/es/pt)\n- fix(i18n): pricing-modal error fallbacks EN hardcodés → tModal()\n\n## Test plan\n- [ ] Ouvrir DevTools en prod (build) → vérifier aucun console.log/warn en navigation normale\n- [ ] Admin panel → title tab = 'Admin — HuntZen'\n- [ ] CV Builder wizard → labels en FR/EN/ES/PT selon locale\n- [ ] Pricing modal → cliquer un plan → message d'erreur simulé en FR\n- [ ] Pricing modal → vérifier affichage nom plan 'Accélérateur' (pas MAJUSCULES)\n\n🤖 Commercial audit — items 🟠 bloquants soldés" \
  --base main
```
