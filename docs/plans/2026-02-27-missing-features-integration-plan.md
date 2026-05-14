# Missing Features Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Brancher l'Interview Simulator, ajouter le Branding comme 6e assistant, et supprimer les console.logs debug en production — en 3 commits atomiques sur une seule PR.

**Architecture:** Toutes les modifications sont frontend-only. Le backend est 100% prêt (routes enregistrées, agents singletons créés). Tâche A = 1 ligne. Tâche B = 4 fichiers, ajout conditionnel de `branding_state`. Tâche C = suppression pure de logs.

**Tech Stack:** Next.js 14, TypeScript, `huntzen-client.ts` (fetch wrapper), Supabase auth, lucide-react icons.

---

## Avant de commencer

```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch
git checkout Production && git pull
git checkout -b feat/missing-features-integration
```

Baseline TypeScript (noter les erreurs pre-existantes pour les ignorer) :
```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "quota-logic\|sentry.server" | head -20
```

---

## Task 1: Brancher l'Interview Simulator

**Files:**
- Modify: `frontend-next/src/app/(dashboard)/assistant/page.tsx` (ligne ~215)

**Contexte :** `handleSimulation()` a un `TODO`. `setSelectedAssistant` vient déjà de `useAssistant()` (ligne 52). Le routing backend dans `huntzen-client.ts` route déjà `'interview-sim'` vers `/api/assistant/interview-sim`.

**Step 1: Lire le fichier pour confirmer l'état exact**

```bash
sed -n '50,55p' frontend-next/src/app/\(dashboard\)/assistant/page.tsx
sed -n '210,225p' frontend-next/src/app/\(dashboard\)/assistant/page.tsx
```

Attendu ligne 52 : `const { selectedAssistant } = useAssistant();`
Attendu ligne 215-220 : `handleSimulation` avec `TODO`.

**Step 2: Vérifier que setSelectedAssistant est exporté par le contexte**

```bash
grep -n "setSelectedAssistant" frontend-next/src/contexts/assistant-context.tsx | head -5
```

Attendu : une ligne avec `setSelectedAssistant` dans le return du hook.

**Step 3: Modifier le destructuring de useAssistant pour inclure setSelectedAssistant**

Dans `frontend-next/src/app/(dashboard)/assistant/page.tsx`, ligne ~52 :

```typescript
// AVANT
const { selectedAssistant } = useAssistant();

// APRÈS
const { selectedAssistant, setSelectedAssistant } = useAssistant();
```

**Step 4: Remplacer le TODO dans handleSimulation**

```typescript
// AVANT (ligne ~215)
const handleSimulation = () => {
  if (!hasFeature("has_interview_sim")) {
    openPricingModal("has_interview_sim");
    return;
  }
  // TODO: Implement interview simulation
};

// APRÈS
const handleSimulation = () => {
  if (!hasFeature("has_interview_sim")) {
    openPricingModal("has_interview_sim");
    return;
  }
  setSelectedAssistant("interview-sim");
};
```

**Step 5: Vérifier TypeScript**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep "assistant/page"
```

Attendu : aucune ligne (0 erreurs dans ce fichier).

**Step 6: Commit**

```bash
git add "frontend-next/src/app/(dashboard)/assistant/page.tsx"
git commit -m "feat: connect interview-sim assistant to backend endpoint"
```

---

## Task 2: Branding comme 6e assistant

**Files:**
- Modify: `frontend-next/src/types/assistant.ts`
- Modify: `frontend-next/src/config/assistants.ts`
- Modify: `frontend-next/src/lib/api/huntzen-client.ts`
- Modify: `frontend-next/src/app/(dashboard)/assistant/page.tsx`

**Contexte :** Le backend `/api/branding/chat` attend `{ message, session_id, language, branding_state? }` et retourne `{ success, response, language, branding_state }`. Le `branding_state` est un dict JSON qui encode la phase de l'utilisateur (onboarding/style/audience/generation). Chaque message doit passer le dernier état reçu.

### Step 1: Lire les fichiers à modifier

```bash
cat frontend-next/src/types/assistant.ts
grep -n "AssistantType\|interview-sim" frontend-next/src/config/assistants.ts | tail -20
grep -n "sendAssistantMessage\|interview-sim" frontend-next/src/lib/api/huntzen-client.ts | head -20
```

### Step 2: Ajouter 'branding' au type AssistantType

Fichier : `frontend-next/src/types/assistant.ts`

Trouver la ligne avec `| "interview-sim"` et ajouter `| "branding"` :

```typescript
// AVANT
export type AssistantType =
  | "career-coach"
  | "job-scout"
  | "cv-analyzer"
  | "cv-adapter"
  | "interview-sim";

// APRÈS
export type AssistantType =
  | "career-coach"
  | "job-scout"
  | "cv-analyzer"
  | "cv-adapter"
  | "interview-sim"
  | "branding";
```

### Step 3: Vérifier que le type compile

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep "types/assistant"
```

Attendu : 0 erreurs (les erreurs pre-existantes `quota-logic` sont ignorées).

### Step 4: Ajouter la config branding dans ASSISTANTS_CONFIG

Fichier : `frontend-next/src/config/assistants.ts`

Ajouter l'import `Linkedin` en haut avec les autres imports lucide :
```typescript
import {
  Briefcase,
  FileText,
  UserCheck,
  FileEdit,
  Mic,
  Linkedin,
} from 'lucide-react'
```

Ajouter dans `ASSISTANTS_CONFIG` après `'interview-sim'` :
```typescript
'branding': {
  id: 'branding',
  name: 'Assistant Branding',
  shortName: 'Assistant Branding',
  description: 'Créez votre présence LinkedIn et X avec l\'IA',
  icon: Linkedin,
  color: '#0077b5',
  bgColor: '#dbeafe',
  isPremium: false,
  certificationBadge: 'Expert Personal Branding',
  specialties: [
    'Posts LinkedIn viraux',
    'Storytelling professionnel',
    'Personal branding X/Twitter',
    'Stratégie de contenu',
  ],
  exampleQuestions: [
    'Aide-moi à rédiger un post LinkedIn sur ma reconversion',
    'Comment développer ma marque personnelle ?',
    'Crée un post engageant sur mon expertise',
  ],
  apiEndpoint: '/api/branding/chat',
  responseTime: '< 2 min',
},
```

Ajouter `'branding'` dans `ASSISTANTS_ORDER` :
```typescript
export const ASSISTANTS_ORDER: AssistantType[] = [
  'career-coach',
  'job-scout',
  'cv-analyzer',
  'cv-adapter',
  'interview-sim',
  'branding',  // ← ajouter ici
]
```

### Step 5: Vérifier config compile

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep "config/assistants"
```

Attendu : 0 erreurs.

### Step 6: Ajouter sendBrandingMessage dans huntzen-client.ts

Fichier : `frontend-next/src/lib/api/huntzen-client.ts`

Trouver la méthode `sendAssistantMessage` et :

**6a.** Ajouter `'branding'` au union type du paramètre `assistantType` :
```typescript
async sendAssistantMessage(
  message: string,
  sessionId: string,
  assistantType:
    | "career-coach"
    | "job-scout"
    | "cv-analyzer"
    | "cv-adapter"
    | "interview-sim"
    | "branding",  // ← ajouter
  language: string = "fr",
)
```

**6b.** Ajouter `"branding"` dans l'`endpointMap` :
```typescript
const endpointMap = {
  "career-coach": "/api/coach/chat",
  "job-scout": "/api/assistant/job-scout",
  "cv-analyzer": "/api/assistant/cv-analyzer",
  "cv-adapter": "/api/assistant/cv-adapter",
  "interview-sim": "/api/assistant/interview-sim",
  "branding": "/api/branding/chat",  // ← ajouter
};
```

**6c.** Ajouter la méthode dédiée `sendBrandingMessage` après `sendAssistantMessage` :
```typescript
async sendBrandingMessage(
  message: string,
  sessionId: string,
  language: string = "fr",
  brandingState?: Record<string, unknown> | null,
): Promise<{
  success: boolean;
  response: string;
  language: string;
  branding_state: Record<string, unknown> | null;
}> {
  return this.fetch("/api/branding/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      session_id: sessionId,
      language,
      branding_state: brandingState ?? null,
    }),
  });
}
```

### Step 7: Vérifier huntzen-client compile

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep "huntzen-client"
```

Attendu : 0 erreurs.

### Step 8: Modifier assistant/page.tsx pour gérer branding_state

Fichier : `frontend-next/src/app/(dashboard)/assistant/page.tsx`

**8a.** Ajouter le state `brandingState` après les autres useState (ligne ~96) :
```typescript
const [brandingState, setBrandingState] = useState<Record<string, unknown> | null>(null);
```

**8b.** Modifier la fonction `sendMessage` pour brancher branding.

Trouver le bloc :
```typescript
const response = await huntzenApi.sendAssistantMessage(
  messageText,
  sessionId,
  selectedAssistant,
  locale,
);
```

Remplacer par :
```typescript
let response: { success: boolean; response: string; agent?: string; language?: string; branding_state?: Record<string, unknown> | null };

if (selectedAssistant === "branding") {
  const brandingResponse = await huntzenApi.sendBrandingMessage(
    messageText,
    sessionId,
    locale,
    brandingState,
  );
  setBrandingState(brandingResponse.branding_state ?? null);
  response = { ...brandingResponse, agent: "branding" };
} else {
  response = await huntzenApi.sendAssistantMessage(
    messageText,
    sessionId,
    selectedAssistant,
    locale,
  );
}
```

**8c.** Réinitialiser `brandingState` dans `handleNewConversation` :
```typescript
const handleNewConversation = () => {
  setMessages([]);
  setCurrentConversationId(null);
  setInput("");
  setBrandingState(null);  // ← ajouter cette ligne
};
```

### Step 9: Vérifier TypeScript complet

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "quota-logic\|sentry.server" | head -20
```

Attendu : 0 nouvelles erreurs (seules les erreurs pre-existantes sont acceptables).

### Step 10: Commit

```bash
git add \
  "frontend-next/src/types/assistant.ts" \
  "frontend-next/src/config/assistants.ts" \
  "frontend-next/src/lib/api/huntzen-client.ts" \
  "frontend-next/src/app/(dashboard)/assistant/page.tsx"
git commit -m "feat: add branding as 6th assistant in /assistant"
```

---

## Task 3: Supprimer les console.logs debug en production

**Files:**
- Modify: `frontend-next/src/contexts/subscription-context.tsx`
- Modify: `frontend-next/src/app/(dashboard)/jobs/page.tsx`
- Modify: `frontend-next/src/components/jobs/search-form-inline.tsx`
- Modify: `frontend-next/src/components/cv/cv-info-panel.tsx`

**Règle :** Supprimer UNIQUEMENT les `console.log` de debug. Garder `console.error` (erreurs légitimes). Ne pas toucher `devLog` (déjà isDev-guardé).

### Step 1: Audit des logs à supprimer

```bash
grep -n "console.log" frontend-next/src/contexts/subscription-context.tsx
grep -n "console.log" "frontend-next/src/app/(dashboard)/jobs/page.tsx"
grep -n "console.log" frontend-next/src/components/jobs/search-form-inline.tsx
grep -n "console.log" frontend-next/src/components/cv/cv-info-panel.tsx
```

Cela donne la liste exacte des numéros de ligne à supprimer.

### Step 2: Supprimer dans subscription-context.tsx

Supprimer les 4 lignes `console.log("[SUBSCRIPTION]...")` identifiées à l'audit.
Garder tous les `console.error`.

### Step 3: Supprimer dans jobs/page.tsx

Supprimer les lignes `console.log` avec `[SEARCH]`, `[QUOTA]`, `[ADVANCED_FILTERS]`.
Garder `console.error`.

### Step 4: Supprimer dans search-form-inline.tsx

Supprimer toutes les lignes `console.log` (les `🏙️`, `❌`, `✅` sont du debug de développement).

### Step 5: Supprimer dans cv-info-panel.tsx

Supprimer les 3 lignes `console.log("[CVInfoPanel]...")`.

### Step 6: Vérifier TypeScript (aucune erreur ne doit apparaître)

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "quota-logic\|sentry.server" | head -10
```

### Step 7: Vérifier qu'aucun console.log debug ne reste

```bash
grep -rn "console.log" frontend-next/src/contexts/subscription-context.tsx
grep -rn "console.log" "frontend-next/src/app/(dashboard)/jobs/page.tsx" | head -5
grep -rn "console.log" frontend-next/src/components/jobs/search-form-inline.tsx | head -5
grep -rn "console.log" frontend-next/src/components/cv/cv-info-panel.tsx
```

Attendu : 0 lignes pour chacun.

### Step 8: Commit

```bash
git add \
  "frontend-next/src/contexts/subscription-context.tsx" \
  "frontend-next/src/app/(dashboard)/jobs/page.tsx" \
  "frontend-next/src/components/jobs/search-form-inline.tsx" \
  "frontend-next/src/components/cv/cv-info-panel.tsx"
git commit -m "fix: remove debug console.logs from production frontend code"
```

---

## Création de la PR

```bash
git push -u origin feat/missing-features-integration
gh pr create \
  --title "feat: Interview Sim + Branding assistant + console.logs cleanup" \
  --body "$(cat <<'EOF'
## Summary

- **Interview Sim**: brancher handleSimulation() → setSelectedAssistant('interview-sim') (1 ligne)
- **Branding**: 6e assistant dans /assistant avec gestion du branding_state (4 fichiers)
- **console.logs**: supprimer ~25 logs debug en production (4 fichiers)
- **Recruiter Finder**: déjà branché ✅ (job-details-modal.tsx:500) — aucun changement

## Test plan

- [ ] Assistant page → cliquer sur Interview Sim (premium) → gating modal s'ouvre
- [ ] Assistant page → si plan Pro → cliquer Interview Sim → bascule vers l'assistant entretien
- [ ] Assistant page → 6e assistant Branding visible dans la liste
- [ ] Sélectionner Branding → envoyer un message → réponse cohérente avec la phase onboarding
- [ ] Nouvelle conversation → brandingState reset (vérifier dans DevTools Network que branding_state=null)
- [ ] Console navigateur → plus de logs [SUBSCRIPTION], [SEARCH], [QUOTA], [CVInfoPanel]
EOF
)"
```

---

## Garde-fous anti-régression

| Vérification | Commande | Attendu |
|---|---|---|
| TypeScript après chaque tâche | `npx tsc --noEmit` | 0 nouvelles erreurs |
| Aucun log debug restant | `grep -rn "console.log" src/contexts/subscription-context.tsx` | 0 lignes |
| AssistantType cohérent | `grep -rn "branding" src/types/assistant.ts src/config/assistants.ts src/lib/api/huntzen-client.ts` | 3 fichiers touchés |
| branding_state reset | Lire `handleNewConversation` | contient `setBrandingState(null)` |
