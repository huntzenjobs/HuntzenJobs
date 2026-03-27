# Landing Page Redesign — HuntZen (Sans IA) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refaire complètement `frontend-next/src/app/page.tsx` — suppression de toutes les références "IA", mise en avant de toutes les features du dashboard, UX/UI "humain" split dark/light, convertissant.

**Architecture:** Next.js 14 App Router, `"use client"`, `next-intl` pour les textes, Framer Motion pour animations, Tailwind CSS, Lucide React pour icônes. La page est un composant client unique. Les textes passent par `fr.json`. La police passe de DM Sans à Plus Jakarta Sans.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Framer Motion, Lucide React, next-intl, shadcn/ui

**Fichiers modifiés :**
- Modify: `frontend-next/src/app/page.tsx` — refonte complète
- Modify: `frontend-next/messages/fr.json` — nouvelles clés landing
- Modify: `frontend-next/src/app/layout.tsx` — ajout Police Plus Jakarta Sans

---

## PROMPT CLÉ EN MAIN (à coller en nouvelle session)

```
Je travaille sur HuntZen dans /Users/wissem/HuntzenIA/huntzen_jobsearch.

Je veux refaire COMPLÈTEMENT la landing page frontend-next/src/app/page.tsx.

DESIGN APPROUVÉ :
- Split dark/light : hero dark (slate-900), reste de la page fond blanc/slate-50
- Police : Plus Jakarta Sans (à installer via next/font ou Google Fonts import)
- Ton : "tu" partout (cohérent avec le dashboard)
- Couleur accent : #00D9FF, CTA final : #F97316 (orange)
- Animations : Framer Motion (déjà installé), scroll-based reveal
- ZERO référence à "IA", "Intelligence Artificielle", "Coach IA"

STRUCTURE EN 8 SECTIONS (dans l'ordre) :

### SECTION 1 — HERO (fond slate-900, dark)
- Capsule tag : "Pour les candidats qui en ont assez de postuler dans le vide"
- H1 (énorme, blanc, font-black) : "Ton CV mérite d'être vu. On s'en assure."
- H2 (blanc/70) : "Toutes les offres du marché, en un seul endroit."
- Subtitle (blanc/50) : "La plateforme complète pour décrocher ton prochain emploi."
- CTA primaire → /signup : "Commencer gratuitement →"
- CTA secondaire → #how : "Voir comment ça marche ↓"
- Social proof sous les CTAs : "Déjà +2 000 candidats accompagnés · Sans carte bancaire"
- Conserver le fond avec grid pattern SVG et orbs animés (déjà dans le code)

### SECTION 2 — TRUST BAR (transition dark→white, fond gradient slate-900→white)
- Texte : "Offres agrégées en temps réel depuis :"
- 6 logos texte (pas d'images) en pills : France Travail · Indeed · LinkedIn · Welcome to the Jungle · HelloWork · APEC
- Animation : fade-in au scroll

### SECTION 3 — COMMENT ÇA MARCHE (fond blanc, id="how")
- Titre : "Comment ça marche ?"
- 3 étapes numérotées (①②③), horizontales desktop, verticales mobile :
  ① Dépose ton CV → "Reçois un score ATS et des recommandations concrètes en moins d'une minute"
  ② Découvre les offres qui te correspondent → "Filtre, sauvegarde et postule aux meilleures en un clic"
  ③ Prépare-toi avec les bons outils → "Coachs carrière, simulation d'entretien, génération de documents — tout est là"

### SECTION 4 — 3 FEATURES STAR (fond blanc, alternées gauche/droite)
Chaque bloc = image placeholder coloré à gauche + texte à droite (Feature B inversée)

Feature A — Recherche d'offres (texte droite)
- Badge : "RECHERCHE"
- Titre : "Des milliers d'offres triées rien que pour toi."
- Description : "Plus besoin de jongler entre 10 sites. Toutes les offres sont ici, filtrées, scorées et mises à jour quotidiennement."
- 4 bullets (CheckCircle2 #00D9FF) :
  · Offres de +6 plateformes (France Travail, Indeed, LinkedIn...)
  · Filtres avancés : salaire, télétravail, taille d'entreprise
  · Score de compatibilité par offre
  · Sauvegarde & suivi de tes candidatures
- CTA link → /jobs : "Explorer les offres →"

Feature B — CV & ATS (texte gauche, image droite — INVERSÉ)
- Badge : "CV & ATS"
- Titre : "Ton CV passe tous les filtres."
- Description : "Obtiens un score ATS détaillé, corrige les points faibles, génère un CV optimisé en PDF — prêt à être vu par les recruteurs, pas rejeté par les logiciels."
- 4 bullets :
  · Score ATS sur 100 avec analyse détaillée
  · Recommandations personnalisées par section
  · Export PDF professionnel certifié ATS
  · Postes recommandés selon ton profil
- CTA link → /cv-analysis : "Analyser mon CV →"

Feature C — Coachs (texte droite)
- Badge : "COACHS CARRIÈRE"
- Titre : "Cinq experts carrière dans ta poche."
- Description : "Nova, Maria, Sofia, Lucas et David — chacun spécialisé dans un domaine. Disponibles 24h/24, sans rendez-vous."
- 5 bullets avec noms :
  · Nova · Stratégie et plan de carrière
  · Maria · Recherche d'emploi et candidatures
  · Sofia · Optimisation et analyse de CV
  · Lucas · Préparation aux entretiens
  · David · Personal Branding et LinkedIn
- CTA link → /assistant : "Parler à un coach →"

Pour les images placeholder : utiliser des blocs colorés avec un dégradé subtil (bg-gradient-to-br from-slate-100 to-slate-200) avec l'icône feature au centre, ou des screenshots UI fictifs en SVG inline. Pas d'images Unsplash.

### SECTION 5 — GRILLE COMPLÈTE (fond slate-50)
- Titre : "Tout ce dont tu as besoin pour réussir"
- Subtitle : "Une seule plateforme. Zéro outil manquant."
- Grid : 3 colonnes desktop / 2 tablette / 1 mobile
- 12 cartes, chaque carte = icône Lucide + Nom en bold + 1 ligne description + badge optionnel

Les 12 features (icône | Nom | Description | badge) :
1. Search | Recherche d'emplois | Agrégateur multi-plateformes mis à jour quotidiennement | —
2. FileText | Analyse CV & Score ATS | Optimise ton CV pour passer tous les filtres automatiquement | —
3. UserCheck | Nova — Coach Carrière | Stratégie, reconversion, plan d'action personnalisé | —
4. Briefcase | Maria — Coach Emploi | Trouve les bonnes offres et postule efficacement | —
5. Award | Sofia — Expert CV | CV percutant qui attire l'attention des recruteurs | —
6. Mic | Lucas — Coach Entretien | Prépare les questions difficiles, gère le stress | "Bientôt"
7. Linkedin | David — Personal Branding | Profil LinkedIn qui attire les recruteurs à toi | —
8. Calendar | Salons & Forums | Événements emploi partout en France | —
9. Bookmark | Offres sauvegardées | Retrouve et suis toutes tes candidatures favorites | —
10. UserCheck2 | Contact Recruteur | Session 1:1 avec un expert RH | "50€"
11. FilePlus | Génération Documents | CV + lettre de motivation adaptés à chaque offre | —
12. Globe | Guide Expatriation | S'installer et travailler dans 15 pays | —

Style carte : bg-white, border border-slate-200, rounded-2xl, p-6, hover:border-[#00D9FF]/40 hover:shadow-lg transition-all

### SECTION 6 — STATS (fond blanc)
- Titre : "Ils nous font confiance"
- Subtitle : "Des candidats qui avancent avec HuntZen chaque jour"
- 3 stats identiques à l'actuel (clés fr.json : stats.candidates, stats.responseRate, stats.salary)
- Disclaimer OBLIGATOIRE sous les stats : {tStats("disclaimer")} en text-xs text-gray-400

### SECTION 7 — PRICING (fond slate-50)
- Titre : {tPricing("title")} — "Choisissez votre plan"
- Subtitle : {tPricing("subtitle")}
- 4 plans : Gratuit (0€) · Starter (8.90€/mois) · Pro (13.90€/mois) · Premium (19.90€/mois)
- Utiliser tPlans("plans.free.*"), tPlans("plans.starter.*"), tPlans("plans.pro.*"), tPlans("plans.premium.*")
- Plan Starter = badge "POPULAIRE" + border-[#00D9FF] + légèrement agrandi (scale-105)
- CTA chaque plan → /signup

### SECTION 8 — CTA FINAL (fond slate-900, dark — même ambiance que hero)
- Titre : "Prêt à décrocher ton prochain emploi ?"
- Subtitle : "Rejoins +2 000 candidats qui avancent avec HuntZen."
- CTA : "Commencer gratuitement — c'est sans engagement"  → /signup
- Effet visuel : même grid pattern + orbs du hero (réutiliser les classes)

RÈGLES ABSOLUES :
- ZERO mot "IA", "Intelligence Artificielle", "Coach IA" dans toute la page et dans fr.json
- Remplacer partout "Coach IA" → "Coach Carrière" ou le nom du coach (Nova, Maria...)
- Toutes les clés de texte passent par fr.json + useTranslations()
- SAUF les noms propres (Nova, Maria, Sofia, Lucas, David) qui peuvent être hardcodés
- Conserver le useEffect ref:// cookie referral déjà présent (ligne 33-39)
- Conserver LandingHeader et Footer existants
- La police Plus Jakarta Sans : ajouter via @import Google Fonts dans le <style jsx global> déjà présent en bas du composant
- Framer Motion : utiliser pour whileInView fade-up sur toutes les sections (déjà installé)
- Icônes : Lucide React uniquement, ZERO emoji

CLÉS fr.json À CRÉER/MODIFIER :
Dans la section "hero" (déjà en place, juste vérifier) :
- hero.subtitle = "CV certifié ATS · Experts carrière · Offres ciblées pour ton profil"
- hero.ctaSearch = "Commencer gratuitement"
- hero.ctaDiscover = "Voir comment ça marche"
- hero.socialProof = "Déjà +2 000 candidats accompagnés · Sans carte bancaire"
- hero.tag = "Pour les candidats qui en ont assez de postuler dans le vide"
- hero.h1 = "Ton CV mérite d'être vu. On s'en assure."
- hero.h2 = "Toutes les offres du marché, en un seul endroit."

Nouvelle section "trustBar" :
- trustBar.title = "Offres agrégées en temps réel depuis :"

Nouvelle section "howItWorks" :
- howItWorks.title = "Comment ça marche ?"
- howItWorks.step1Title = "Dépose ton CV"
- howItWorks.step1Desc = "Reçois un score ATS et des recommandations concrètes en moins d'une minute"
- howItWorks.step2Title = "Découvre les offres qui te correspondent"
- howItWorks.step2Desc = "Filtre, sauvegarde et postule aux meilleures en un clic"
- howItWorks.step3Title = "Prépare-toi avec les bons outils"
- howItWorks.step3Desc = "Coachs carrière, simulation d'entretien, génération de documents — tout est là"

Nouvelle section "featuresGrid" :
- featuresGrid.title = "Tout ce dont tu as besoin pour réussir"
- featuresGrid.subtitle = "Une seule plateforme. Zéro outil manquant."
- featuresGrid.badgeSoon = "Bientôt"

Nouvelle section "ctaFinal" :
- ctaFinal.title = "Prêt à décrocher ton prochain emploi ?"
- ctaFinal.subtitle = "Rejoins +2 000 candidats qui avancent avec HuntZen."
- ctaFinal.cta = "Commencer gratuitement — c'est sans engagement"

Dans "features" (star features), ajouter :
- features.jobs.badge = "RECHERCHE"
- features.jobs.title = "Des milliers d'offres triées rien que pour toi."
- features.jobs.description = "Plus besoin de jongler entre 10 sites. Toutes les offres sont ici, filtrées, scorées et mises à jour quotidiennement."
- features.jobs.bullet1 = "Offres de +6 plateformes (France Travail, Indeed, LinkedIn...)"
- features.jobs.bullet2 = "Filtres avancés : salaire, télétravail, taille d'entreprise"
- features.jobs.bullet3 = "Score de compatibilité par offre"
- features.jobs.bullet4 = "Sauvegarde & suivi de tes candidatures"
- features.jobs.cta = "Explorer les offres →"
- features.cv.badge = "CV & ATS"
- features.cv.title = "Ton CV passe tous les filtres."
- features.cv.description = "Obtiens un score ATS détaillé, corrige les points faibles, génère un CV optimisé en PDF — prêt à être vu par les recruteurs."
- features.cv.bullet1 = "Score ATS sur 100 avec analyse détaillée"
- features.cv.bullet2 = "Recommandations personnalisées par section"
- features.cv.bullet3 = "Export PDF professionnel certifié ATS"
- features.cv.bullet4 = "Postes recommandés selon ton profil"
- features.cv.cta = "Analyser mon CV →"
- features.coaches.badge = "COACHS CARRIÈRE"
- features.coaches.title = "Cinq experts carrière dans ta poche."
- features.coaches.description = "Nova, Maria, Sofia, Lucas et David — chacun spécialisé dans un domaine. Disponibles 24h/24, sans rendez-vous."
- features.coaches.cta = "Parler à un coach →"

FICHIERS À LIRE AVANT DE CODER :
1. frontend-next/src/app/page.tsx — page actuelle complète
2. frontend-next/messages/fr.json — toutes les clés existantes
3. frontend-next/src/config/assistants.ts — noms des coachs (Nova, Maria, Sofia, Lucas, David)
4. frontend-next/src/components/landing-header.tsx — pour vérifier les imports

COMMANDES DE VÉRIFICATION :
- cd frontend-next && npx tsc --noEmit (0 erreur TypeScript attendu)
- Vérifier visuellement : http://localhost:3001 (ou port du dev server)

COMMIT FINAL :
git add frontend-next/src/app/page.tsx frontend-next/messages/fr.json
git commit -m "feat(landing): refonte complète — sans IA, 8 sections, 12 features, split dark/light"
```

---

## Checklist d'implémentation manuelle

- [ ] **Step 1** : Lire `page.tsx` et `fr.json` actuels
- [ ] **Step 2** : Ajouter toutes les nouvelles clés dans `fr.json` (sections hero, trustBar, howItWorks, featuresGrid, features.jobs/cv/coaches, ctaFinal)
- [ ] **Step 3** : Remplacer `page.tsx` — Section 1 Hero dark
- [ ] **Step 4** : Ajouter Section 2 Trust Bar + transition
- [ ] **Step 5** : Ajouter Section 3 Comment ça marche (3 steps)
- [ ] **Step 6** : Ajouter Section 4 Feature A — Recherche (texte droite)
- [ ] **Step 7** : Ajouter Section 4 Feature B — CV ATS (texte gauche, INVERSÉ)
- [ ] **Step 8** : Ajouter Section 4 Feature C — Coachs (texte droite)
- [ ] **Step 9** : Ajouter Section 5 Grille 12 features
- [ ] **Step 10** : Ajouter Section 6 Stats + disclaimer
- [ ] **Step 11** : Vérifier Section 7 Pricing (plans.starter.* au lieu de plans.essential.*)
- [ ] **Step 12** : Ajouter Section 8 CTA Final dark
- [ ] **Step 13** : Ajouter `@import` Plus Jakarta Sans dans `<style jsx global>`
- [ ] **Step 14** : `npx tsc --noEmit` → 0 erreur
- [ ] **Step 15** : Commit
