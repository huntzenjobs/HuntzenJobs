# CV Upload dans l'Assistant Chat — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre à l'utilisateur d'uploader son CV directement dans le chat assistant, déclencher une analyse initiale intelligente contextuelle, et maintenir le CV dans l'historique de conversation pour toute la session.

**Architecture:** Le CV uploadé est extrait via Modal/Docling, structuré via Groq JSON mode, puis injecté dans l'historique de session Supabase. Tous les agents le voient naturellement à chaque tour via `get_session_history()` — aucun changement dans les signatures des agents. L'endpoint `/api/assistant/attach-cv` gère extraction + structuration + première réponse LLM.

**Tech Stack:** FastAPI (multipart upload), Groq JSON mode, Modal/Docling (extraction existante), Next.js (hidden file input + state), LangChain messages, Supabase session storage.

---

## Task 1 : Backend — Service d'extraction structurée

**Files:**
- Create: `backend/src/services/cv_chat_extractor.py`

**Step 1: Créer le service**

```python
"""
CV Chat Extractor
=================
Extrait les données structurées d'un CV texte pour le contexte chat.
Utilise Groq JSON mode (rapide, ~1s) pour structurer les infos clés.
"""
import json
import logging
from typing import Any

from groq import Groq

from src.config.settings import settings

logger = logging.getLogger(__name__)


async def extract_cv_structured(cv_text: str) -> dict[str, Any]:
    """
    Extrait les données structurées d'un CV via Groq JSON mode.
    Utilisé pour enrichir le contexte du chat — pas pour l'analyse complète.

    Args:
        cv_text: Texte brut du CV (premiers 3000 chars utilisés)

    Returns:
        Dict structuré avec name, current_role, years_experience, key_skills, etc.
    """
    try:
        client = Groq(api_key=settings.get_groq_key())

        prompt = f"""Extrais les informations clés de ce CV. Retourne UNIQUEMENT du JSON valide.

CV (extrait):
{cv_text[:3000]}

Structure JSON attendue:
{{
  "name": "Prénom Nom (ou 'Candidat' si non trouvé)",
  "current_role": "Poste actuel ou dernier poste occupé",
  "years_experience": 0,
  "key_skills": ["skill1", "skill2", "skill3"],
  "education": ["Diplôme — École (année)"],
  "experiences": [
    {{"company": "Entreprise", "role": "Poste", "period": "2020-2023"}}
  ],
  "languages": ["Français", "Anglais"],
  "summary": "Résumé en 1 phrase du profil candidat"
}}"""

        response = client.chat.completions.create(
            model=settings.llm_model_fast,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=1024,
        )

        structured = json.loads(response.choices[0].message.content)
        logger.info(f"[CVChatExtractor] Structured: {structured.get('name')} / {structured.get('current_role')}")
        return structured

    except Exception as e:
        logger.warning(f"[CVChatExtractor] Extraction failed, returning minimal data: {e}")
        return {
            "name": "Candidat",
            "current_role": "Non spécifié",
            "years_experience": 0,
            "key_skills": [],
            "education": [],
            "experiences": [],
            "languages": [],
            "summary": "CV partagé"
        }
```

**Step 2: Vérifier que ça tourne (dry run)**
```bash
cd backend
python -c "
import asyncio
from src.services.cv_chat_extractor import extract_cv_structured
result = asyncio.run(extract_cv_structured('Jean Dupont, Développeur Python 5 ans expérience, compétences: Python, Django, SQL'))
print(result)
"
```
Attendu: dict JSON avec name="Jean Dupont" ou similaire

**Step 3: Commit**
```bash
git add backend/src/services/cv_chat_extractor.py
git commit -m "feat(assistant): add CV structured extractor service (Groq JSON mode)"
```

---

## Task 2 : Backend — Endpoint `/api/assistant/attach-cv`

**Files:**
- Modify: `backend/src/api/routes/assistant.py`

**Step 1: Ajouter les imports nécessaires en haut du fichier**

Après les imports existants, ajouter:
```python
import asyncio
import json
import logging

from fastapi import File, Form, UploadFile

from src.services.cv_chat_extractor import extract_cv_structured
from src.services.modal_pdf_extractor import extract_text_via_modal, is_modal_pdf_enabled

logger = logging.getLogger(__name__)

# Prompts système pour la première réponse après réception du CV
# Adapté par type d'assistant pour une réponse vraiment contextualisée
CV_RECEPTION_SYSTEM_PROMPTS: dict[str, str] = {
    "cv-analyzer": (
        "L'utilisateur vient de partager son CV. "
        "Fais une analyse ATS approfondie : identifie le score estimé, les points forts, "
        "les axes d'amélioration prioritaires, et les mots-clés manquants. "
        "Sois précis, actionnable et bienveillant. Structure ta réponse avec des sections claires."
    ),
    "cv-adapter": (
        "L'utilisateur vient de partager son CV. "
        "Résume brièvement son profil (poste, expérience, compétences clés), "
        "puis demande-lui l'offre d'emploi ou le type de poste visé pour adapter le CV. "
        "Sois enthousiaste et professionnel."
    ),
    "career-coach": (
        "L'utilisateur vient de partager son CV. "
        "Analyse son parcours professionnel, identifie ses forces et les opportunités d'évolution, "
        "puis engage une conversation de coaching personnalisée. "
        "Pose une question clé sur ses objectifs professionnels."
    ),
    "job-scout": (
        "L'utilisateur vient de partager son CV. "
        "Analyse son profil et suggère 3-5 types de postes qui correspondent à son expérience. "
        "Identifie les secteurs porteurs et les mots-clés à utiliser dans sa recherche d'emploi."
    ),
    "branding": (
        "L'utilisateur vient de partager son CV. "
        "Identifie les éléments les plus forts pour construire son personal branding LinkedIn. "
        "Propose un titre LinkedIn percutant et une accroche de profil basés sur son parcours."
    ),
    "interview-sim": (
        "L'utilisateur vient de partager son CV. "
        "Présente-toi comme recruteur, confirme avoir pris connaissance de son profil, "
        "et propose de commencer la simulation d'entretien. "
        "Commence par une question d'entretien typique basée sur son expérience."
    ),
}
```

**Step 2: Ajouter la fonction d'extraction PDF avec fallback pypdf**

```python
async def _extract_pdf_text(pdf_bytes: bytes, filename: str) -> str:
    """
    Extrait le texte d'un PDF. Essaie Modal/Docling en premier, fallback pypdf.
    """
    # Essai 1 : Modal (qualité supérieure)
    if is_modal_pdf_enabled():
        try:
            logger.info(f"[attach-cv] Trying Modal extraction for {filename}")
            text = await extract_text_via_modal(pdf_bytes)
            if text and len(text.strip()) >= 100:
                logger.info(f"[attach-cv] Modal extraction OK: {len(text)} chars")
                return text
        except Exception as e:
            logger.warning(f"[attach-cv] Modal failed, trying pypdf: {e}")

    # Fallback : pypdf (toujours disponible)
    try:
        import io
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        text = "\n".join(
            page.extract_text() or "" for page in reader.pages
        ).strip()

        if text and len(text) >= 50:
            logger.info(f"[attach-cv] pypdf extraction OK: {len(text)} chars")
            return text
    except Exception as e:
        logger.error(f"[attach-cv] pypdf fallback also failed: {e}")

    raise RuntimeError("Impossible d'extraire le texte du PDF. Vérifiez que le fichier n'est pas scanné ou protégé.")
```

**Step 3: Ajouter l'endpoint `/attach-cv`**

Ajouter AVANT le endpoint `@router.post("/new-session")`:

```python
@router.post("/attach-cv")
async def attach_cv_to_chat(
    file: UploadFile = File(..., description="Fichier PDF du CV"),
    assistant_type: str = Form(default="career-coach"),
    session_id: str = Form(..., description="Session ID du chat"),
    language: str = Form(default="fr"),
    coach_agent: CoachAgentDep = Depends(),
    cv_agent: CVAgentDep = Depends(),
    cv_adapter_agent: CVAdapterAgentDep = Depends(),
    scout_agent: ScoutConversationalAgentDep = Depends(),
):
    """
    Upload et attach un CV à une session de chat.

    Étapes:
    1. Validation et extraction texte (Modal/Docling + fallback pypdf)
    2. Extraction structurée rapide (Groq JSON mode ~1s)
    3. Injection du CV dans l'historique de session
    4. Génération d'une première réponse IA contextuelle
    5. Retour: cv_structured + initial_response

    Le CV reste dans l'historique pour toute la durée de la session.
    """
    # Validation du fichier
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les fichiers PDF sont acceptés",
        )

    pdf_bytes = await file.read()

    MAX_PDF_SIZE = 10 * 1024 * 1024  # 10MB
    if len(pdf_bytes) > MAX_PDF_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fichier trop volumineux ({len(pdf_bytes) / 1024 / 1024:.1f}MB, max 10MB)",
        )

    try:
        # Étape 1 : Extraction texte
        logger.info(f"[attach-cv] Extracting text from {file.filename} ({len(pdf_bytes)} bytes)")
        cv_text = await _extract_pdf_text(pdf_bytes, file.filename or "cv.pdf")

        # Étape 2 : Extraction structurée (en parallèle avec la préparation)
        cv_structured = await extract_cv_structured(cv_text)
        candidate_name = cv_structured.get("name", "le candidat")

        # Étape 3 : Injection dans l'historique de session
        # Le CV est stocké comme un message user dans l'historique Supabase/mémoire.
        # Tous les agents le voient naturellement à chaque tour via get_session_history().
        cv_message_content = (
            f"[CV PARTAGÉ — {file.filename}]\n\n"
            f"{cv_text}\n\n"
            f"[FIN DU CV]"
        )
        # On n'appelle pas update_session_history ici car l'agent va le faire
        # après avoir généré sa réponse. On prépare juste l'historique courant.
        current_history = get_session_history(session_id)

        # Étape 4 : Génération de la première réponse contextuelle
        system_context = CV_RECEPTION_PROMPTS.get(
            assistant_type,
            CV_RECEPTION_PROMPTS["career-coach"]
        )

        # Message synthétique envoyé à l'agent pour déclencher l'analyse
        lang_names = {"fr": "French", "en": "English"}
        lang_name = lang_names.get(language, "French")
        first_message = (
            f"[IMPORTANT: Respond in {lang_name}. {system_context}]\n\n"
            f"{cv_message_content}"
        )

        # Sélection de l'agent selon assistant_type
        agent_map = {
            "cv-analyzer": cv_agent,
            "cv-adapter": cv_adapter_agent,
            "job-scout": scout_agent,
            "career-coach": coach_agent,
            "interview-sim": coach_agent,  # fallback coach pour interview
            "branding": coach_agent,       # fallback coach pour branding
        }
        agent = agent_map.get(assistant_type, coach_agent)

        result = await agent.run(
            message=first_message,
            history=current_history,
            language=language,
        )

        if not result.get("success"):
            raise RuntimeError(result.get("error", "Erreur agent"))

        initial_response = result["response"]

        # Étape 5 : Persister dans l'historique de session
        # Le CV (message user) + la réponse (message assistant)
        update_session_history(session_id, cv_message_content, initial_response)

        logger.info(
            f"[attach-cv] CV attached for session {session_id[:8]}... "
            f"({len(cv_text)} chars, assistant={assistant_type})"
        )

        return {
            "success": True,
            "filename": file.filename,
            "char_count": len(cv_text),
            "cv_structured": cv_structured,
            "initial_response": initial_response,
        }

    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"[attach-cv] Unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors du traitement du CV",
        )
```

**ATTENTION**: Le `CV_RECEPTION_PROMPTS` référencé dans l'endpoint doit utiliser la constante `CV_RECEPTION_PROMPTS` (sans `_SYSTEM` dans le nom). Vérifier la cohérence des noms.

**Step 4: Vérifier la cohérence des imports**

S'assurer que `CoachAgentDep`, `CVAgentDep`, `CVAdapterAgentDep`, `ScoutConversationalAgentDep` sont bien importés depuis `src.api.deps` (ils l'étaient déjà dans le fichier).

Ajouter `Depends` à l'import fastapi:
```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
```

**Step 5: Commit**
```bash
git add backend/src/api/routes/assistant.py backend/src/services/cv_chat_extractor.py
git commit -m "feat(assistant): add /attach-cv endpoint with Modal extraction + structured analysis"
```

---

## Task 3 : Frontend — Méthode API dans huntzen-client.ts

**Files:**
- Modify: `frontend-next/src/lib/api/huntzen-client.ts`

**Step 1: Ajouter l'interface de retour et la méthode**

Après la méthode `sendCVAdapterMessage` (vers la ligne 500), ajouter:

```typescript
// ── CV Attachment for Chat ──────────────────────────────────────

interface AttachCVResponse {
  success: boolean;
  filename: string;
  char_count: number;
  cv_structured: {
    name: string;
    current_role: string;
    years_experience: number;
    key_skills: string[];
    education: string[];
    experiences: Array<{ company: string; role: string; period: string }>;
    languages: string[];
    summary: string;
  };
  initial_response: string;
}

/**
 * Upload un CV PDF dans une session de chat assistant.
 * Déclenche extraction Modal/Docling + analyse structurée + première réponse IA.
 */
async attachCVToAssistant(
  file: File,
  assistantType: string,
  sessionId: string,
  language: string = "fr",
): Promise<AttachCVResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("assistant_type", assistantType);
  formData.append("session_id", sessionId);
  formData.append("language", language);

  const response = await fetch(
    `${this.baseUrl}/api/assistant/attach-cv`,
    {
      method: "POST",
      headers: {
        // PAS de Content-Type — le browser le set automatiquement avec boundary pour multipart
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Erreur ${response.status} lors de l'upload du CV`,
    );
  }

  return response.json();
}
```

**Étape importante**: Vérifier comment `huntzen-client.ts` gère l'authentification (le `this.token` ou `this.baseUrl`). Regarder comment `analyzeCVFile` (ligne ~350) fait son fetch pour reproduire exactement le même pattern d'auth.

**Step 2: Commit**
```bash
git add frontend-next/src/lib/api/huntzen-client.ts
git commit -m "feat(assistant): add attachCVToAssistant() API method"
```

---

## Task 4 : Frontend — UI dans assistant/page.tsx

**Files:**
- Modify: `frontend-next/src/app/(dashboard)/assistant/page.tsx`

### Step 1: Ajouter les imports

En haut du fichier, s'assurer que `Paperclip`, `X`, `CheckCircle2` sont importés depuis lucide-react. Vérifier les imports existants et ajouter seulement ce qui manque.

### Step 2: Ajouter l'état CV dans le composant

Après les lignes d'état existants (`const [input, setInput]`, `const [loading, setLoading]`, etc.), ajouter:

```typescript
// CV attaché dans la session
const [attachedCV, setAttachedCV] = useState<{
  filename: string;
  structured: Record<string, unknown>;
} | null>(null);
const [isExtractingCV, setIsExtractingCV] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

### Step 3: Ajouter la fonction handleCVUpload

Après la fonction `sendMessage`, ajouter:

```typescript
const handleCVUpload = async (file: File) => {
  if (!file || file.type !== "application/pdf") {
    // Toast d'erreur si disponible dans le projet
    console.error("Seuls les PDFs sont acceptés");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    console.error("Fichier trop volumineux (max 10MB)");
    return;
  }

  setIsExtractingCV(true);

  try {
    const result = await huntzenApi.attachCVToAssistant(
      file,
      selectedAssistant,
      sessionId,
      locale,
    );

    // Stocker le CV attaché
    setAttachedCV({
      filename: result.filename,
      structured: result.cv_structured as Record<string, unknown>,
    });

    // Ajouter un message user visuel dans le chat (affiche l'upload)
    const cvUserMessage: ChatMessageType = {
      id: uuidv4(),
      role: "user",
      content: `📎 J'ai partagé mon CV : **${result.filename}**`,
      timestamp: new Date(),
    };

    // Ajouter la réponse initiale de l'assistant
    const assistantMessage: ChatMessageType = {
      id: uuidv4(),
      role: "assistant",
      content: result.initial_response,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, cvUserMessage, assistantMessage]);

    // Démarrer le timer coach si nécessaire (premier échange)
    if (!isCoachSessionActive && isFreePlan) {
      startCoachSession();
    }
  } catch (error) {
    const errorMessage: ChatMessageType = {
      id: uuidv4(),
      role: "assistant",
      content:
        "❌ Impossible de traiter votre CV. Vérifiez que le fichier est un PDF valide et non protégé.",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, errorMessage]);
  } finally {
    setIsExtractingCV(false);
    // Reset l'input file pour permettre un re-upload du même fichier
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }
};
```

### Step 4: Modifier la zone de saisie (input area)

Localiser le bloc `<div className="flex gap-2 items-end">` qui contient `ExpandableTextarea` et le bouton Send (vers ligne 613).

**Remplacer** ce bloc par:

```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  className="flex flex-col gap-2"
>
  {/* Badge CV attaché */}
  {attachedCV && (
    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm text-green-700 w-fit">
      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
      <span className="font-medium truncate max-w-[200px]">{attachedCV.filename}</span>
      <button
        onClick={() => setAttachedCV(null)}
        className="ml-1 text-green-500 hover:text-green-700 transition-colors"
        aria-label="Retirer le CV"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )}

  {/* Zone de saisie */}
  <div className="flex gap-2 items-end">
    {/* Input file caché */}
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleCVUpload(file);
      }}
    />

    {/* Bouton upload CV */}
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={loading || isExtractingCV}
      className={`
        flex items-center justify-center h-12 w-12 rounded-xl border-2 transition-all duration-200 flex-shrink-0
        ${isExtractingCV
          ? "border-[#00D9FF] bg-[#00D9FF]/10 cursor-not-allowed"
          : attachedCV
          ? "border-green-400 bg-green-50 text-green-600 hover:bg-green-100"
          : "border-slate-200 bg-white text-slate-500 hover:border-[#00D9FF] hover:text-[#00D9FF] hover:bg-[#00D9FF]/5"
        }
      `}
      title={attachedCV ? `CV: ${attachedCV.filename}` : "Joindre votre CV (PDF)"}
    >
      {isExtractingCV ? (
        <Loader2 className="h-5 w-5 animate-spin text-[#00D9FF]" />
      ) : attachedCV ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : (
        <Paperclip className="h-5 w-5" />
      )}
    </button>

    {/* Textarea */}
    <div className="flex-1">
      <ExpandableTextarea
        value={input}
        onChange={setInput}
        placeholder={
          isExtractingCV
            ? "Analyse de votre CV en cours..."
            : t("placeholder")
        }
        disabled={loading || isExtractingCV}
        minHeight={44}
        maxHeight={120}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && !loading) {
              sendMessage(input);
            }
          }
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            if (input.trim() && !loading) {
              sendMessage(input);
            }
          }
        }}
      />
    </div>

    {/* Bouton Send */}
    <Button
      onClick={() => sendMessage(input)}
      disabled={!input.trim() || loading || isExtractingCV}
      size="lg"
      className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white h-12 px-6 transition-all duration-300"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Send className="h-5 w-5" />
      )}
    </Button>
  </div>
</motion.div>
```

### Step 5: Vérifier les imports dans page.tsx

S'assurer que ces imports sont présents en haut du fichier:
- `Paperclip, CheckCircle2, X` depuis `lucide-react`
- `useRef` depuis `react` (déjà présent probablement)

### Step 6: Reset CV quand l'assistant change

Dans le `useEffect` ou handler qui gère `setSelectedAssistant`, ajouter:
```typescript
setAttachedCV(null);
```

Chercher dans le fichier où `selectedAssistant` change et reset le CV attaché en conséquence.

### Step 7: Commit
```bash
git add frontend-next/src/app/(dashboard)/assistant/page.tsx
git commit -m "feat(assistant): add CV upload button with extraction state and auto-response"
```

---

## Task 5 : Vérification end-to-end

**Step 1: Démarrer le backend**
```bash
cd backend
uvicorn src.main:app --reload --port 8000
```

**Step 2: Tester l'endpoint directement**
```bash
curl -X POST http://localhost:8000/api/assistant/attach-cv \
  -F "file=@/chemin/vers/cv.pdf" \
  -F "assistant_type=career-coach" \
  -F "session_id=test-session-123" \
  -F "language=fr"
```
Attendu: `{ "success": true, "cv_structured": {...}, "initial_response": "..." }`

**Step 3: Tester dans le browser**
1. Ouvrir `http://localhost:3000/dashboard/assistant`
2. Cliquer sur le trombone → sélectionner un PDF
3. Vérifier: spinner pendant extraction (~3-8s), puis réponse IA dans le chat
4. Envoyer un message de suivi → vérifier que l'assistant référence le CV

**Step 4: Tester le changement d'assistant**
- Avec CV attaché, changer d'assistant → badge CV doit disparaître

**Step 5: Tester cas d'erreur**
- Uploader un fichier non-PDF → message d'erreur
- Uploader un PDF scanné (sans texte) → message d'erreur clair

---

## Notes importantes

### Pattern d'auth dans huntzen-client.ts
Vérifier comment `analyzeCVFile` (~ligne 350) gère l'auth avant d'écrire `attachCVToAssistant`. Le client a probablement un `this.token` ou `this.getAuthHeaders()` method — utiliser exactement le même pattern.

### Fallback pypdf
`pypdf` doit être dans les dépendances backend. Vérifier `backend/requirements.txt` ou `pyproject.toml`. S'il manque: `pip install pypdf`.

### Reset du CV quand session change
Si l'utilisateur crée une nouvelle session de chat (bouton "Nouvelle conversation"), le `attachedCV` state doit aussi être reset. Chercher où `sessionId` est recréé et ajouter `setAttachedCV(null)`.

### La constante CV_RECEPTION_PROMPTS vs CV_RECEPTION_SYSTEM_PROMPTS
Dans le code du Task 2, la constante est appelée `CV_RECEPTION_SYSTEM_PROMPTS` dans les Step 1 mais `CV_RECEPTION_PROMPTS` dans le Step 3. **Utiliser un seul nom cohérent** : `CV_RECEPTION_PROMPTS`.
