# Design: Missing Features Integration
**Date:** 2026-02-27
**Branch:** feat/missing-features-integration
**PR:** Single PR at the end

---

## Audit Summary (verified against actual code)

| Feature | Backend | Frontend | Status |
|---------|---------|---------|--------|
| Interview Sim | ✅ `/api/assistant/interview-sim` | ✅ UI exists, 1 TODO | 1 line fix |
| Branding | ✅ `/api/branding/chat` with state machine | ❌ No page | New assistant tab |
| Recruiter Finder | ✅ `/api/recruiter-finder/find` | ✅ Drawer exists + connected | ✅ Already done |
| console.logs | N/A | ❌ 25+ unguarded logs in prod | Cleanup |

---

## Task A — Interview Sim (1 line)

**File:** `frontend-next/src/app/(dashboard)/assistant/page.tsx:215`

The `handleSimulation()` function checks premium gating then has a `TODO`. The fix is to call `setSelectedAssistant('interview-sim')` — the existing `sendMessage` → `sendAssistantMessage` routing already handles this via `huntzen-client.ts` endpointMap.

```typescript
const handleSimulation = () => {
  if (!hasFeature("has_interview_sim")) { openPricingModal("has_interview_sim"); return; }
  setSelectedAssistant('interview-sim');
};
```

`setSelectedAssistant` already comes from `useAssistant()` context (line 52).
No backend changes. No new files.

---

## Task B — Branding (6th assistant)

Backend `/api/branding/chat` has unique `branding_state` field (dict) that tracks the user's phase through a 4-step state machine (onboarding → style → audience → generation). This state must be passed in each request and updated from each response.

### Files to modify (4)

**1. `frontend-next/src/types/assistant.ts`**
Add `'branding'` to `AssistantType` union.

**2. `frontend-next/src/config/assistants.ts`**
Add branding config entry:
- icon: `Linkedin` (lucide)
- color: `#0077b5` (LinkedIn blue)
- isPremium: false
- apiEndpoint: `/api/branding/chat`
- specialties: LinkedIn posts, X/Twitter, storytelling, personal branding

**3. `frontend-next/src/lib/api/huntzen-client.ts`**
Add `sendBrandingMessage(message, sessionId, language, brandingState?)`:
- POST `/api/branding/chat`
- Returns `{ success, response, language, branding_state }`
- Add `'branding'` to `sendAssistantMessage` union type + endpointMap (fallback, state handled separately)

**4. `frontend-next/src/app/(dashboard)/assistant/page.tsx`**
- Add `const [brandingState, setBrandingState] = useState<Record<string, unknown> | null>(null);`
- In `sendMessage`: if `selectedAssistant === 'branding'`, call `huntzenApi.sendBrandingMessage(...)` and update `brandingState` from response
- Reset `brandingState` to `null` in `handleNewConversation()`

### No backend changes needed — `/api/branding/chat` is fully registered and functional.

---

## Task C — console.logs cleanup

Remove all unguarded debug `console.log` from production frontend code.

| File | Logs to remove |
|------|---------------|
| `src/contexts/subscription-context.tsx` | 4 `[SUBSCRIPTION]` logs |
| `src/app/(dashboard)/jobs/page.tsx` | ~8 debug logs (`🔍 [SEARCH]`, `📊 [QUOTA]`, `[ADVANCED_FILTERS]`) |
| `src/components/jobs/search-form-inline.tsx` | ~10 logs (`🏙️`, `❌`, `✅`) |
| `src/components/cv/cv-info-panel.tsx` | 3 `[CVInfoPanel]` logs |

Keep: `console.error` (legitimate error logging), `devLog` (already isDev-guarded in auth-context).

---

## Task D — Recruiter Finder

✅ **Already done.** `job-details-modal.tsx` imports and renders `<RecruiterFinderDrawer>` at line 500. No code changes needed. Visual verification only.

---

## Guardrails (anti-hallucination, anti-regression)

Before each commit:
1. `npx tsc --noEmit` — 0 new TypeScript errors in modified files
2. Check that `AssistantType` union is consistent across `types/assistant.ts`, `config/assistants.ts`, `huntzen-client.ts`
3. Verify branding's `branding_state` is reset on new conversation
4. Verify no existing tests broken

Before PR:
1. `next build` passes (or same pre-existing errors as baseline)
2. All 4 task commits are clean and atomic

---

## Commit strategy

```
feat: connect interview-sim assistant to backend endpoint
feat: add branding as 6th assistant in /assistant
fix: remove debug console.logs from production frontend code
```

One PR, three commits, merged to `Production`.
