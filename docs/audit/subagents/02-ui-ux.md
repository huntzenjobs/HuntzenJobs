# Audit -- UI/UX
Date : 2026-03-18
Score : 40/100

## Resume executif

L'architecture UI du dashboard est solide (sidebar responsive, mobile menu anime, loading states sur les pages principales). Cependant, **4 pages dashboard entieres** n'utilisent aucune internationalisation (candidatures, expat, referral, documents partiellement), des `alert()` natifs remplacent les toasts dans plusieurs composants critiques, aucune page dashboard n'a de `error.tsx` (erreur non recuperable = ecran blanc), et plusieurs pages manquent de metadata SEO. La page pricing a des temoignages et FAQs entierement hardcodes en francais sans `useTranslations`.

---

## BLOQUANTS

### B01 -- Aucun error.tsx dans le dashboard
- **Fichier :** `frontend-next/src/app/(dashboard)/` (aucun `error.tsx` dans aucune sous-route)
- **Probleme :** Si un composant crash (erreur JS non attrapee), l'utilisateur voit un ecran blanc sans possibilite de recuperer. Certaines pages utilisent `<ErrorBoundary>` en interne (salons, cv-analysis) mais ce n'est pas systematique, et aucune n'a le fichier `error.tsx` Next.js App Router qui capture les erreurs au niveau route.
- **Impact client :** Perte de confiance immediate -- ecran blanc = "l'app est cassee"
- **Fix :** Creer `frontend-next/src/app/(dashboard)/error.tsx` avec un composant "Oups, une erreur est survenue" + bouton retry/retour.

### B02 -- alert() natif utilise dans des composants critiques
- **Fichier :** `frontend-next/src/components/cv/cv-upload-async-wizard.tsx:431,679,685,1592`
- **Fichier :** `frontend-next/src/components/cv/cv-upload-async.tsx:198`
- **Fichier :** `frontend-next/src/app/(dashboard)/recruiter-contact/page.tsx:140`
- **Fichier :** `frontend-next/src/components/recruiter/recruiter-contact-modal.tsx:93`
- **Probleme :** `alert()` bloque le thread UI, n'est pas stylise, casse l'experience mobile, et empeche l'interaction avec l'app. Le projet utilise deja `sonner` (toast) partout ailleurs.
- **Impact client :** Experience non professionnelle sur un produit payant. Sur iOS Safari, alert() peut causer des bugs de scroll.
- **Fix :** Remplacer tous les `alert()` par `toast.error()` de sonner.

### B03 -- Page candidatures 100% hardcodee (zero i18n)
- **Fichier :** `frontend-next/src/app/(dashboard)/candidatures/page.tsx`
- **Probleme :** Aucun `useTranslations` importe. Tous les textes sont en francais hardcode : "Postule", "CV consulte", "Entretien", "Refuse", "Mes Candidatures", "Suis l'avancement", "Connecte-toi", "Aujourd'hui", "Hier", "Il y a X jours", "Aucune candidature", "Tous les statuts", "Voir l'offre", "Supprimer", "Total", "En attente", "Entretiens", "Offres", "Chercher des offres".
- **Impact client :** Inutilisable pour les utilisateurs anglais/espagnols/portugais.
- **Fix :** Externaliser toutes les chaines dans `messages/fr.json` etc., importer `useTranslations("dashboard.candidatures")`.

### B04 -- Page referral 100% hardcodee (zero i18n)
- **Fichier :** `frontend-next/src/app/(dashboard)/referral/page.tsx`
- **Probleme :** Aucun `useTranslations`. Textes hardcodes : "HuntZen Boost", "Invitez. Debloquez. Progressez.", "Parrainez des amis", "Ton lien de parrainage", "Copie !" / "Copier", "WhatsApp", "LinkedIn", "Clics", "Inscrits", "Valides", "Ta progression", "Recompenses", "Tes filleuls", "Impossible de charger vos donnees", "Reessayer", message WhatsApp hardcode "Rejoins HuntZen et trouve ton prochain job plus vite !".
- **Impact client :** Page commercialement importante (acquisition virale) inaccessible en EN/ES/PT.
- **Fix :** Creer namespace `dashboard.referral` dans les 4 fichiers de messages.

---

## IMPORTANTS

### I01 -- Page expat 100% hardcodee (zero i18n)
- **Fichier :** `frontend-next/src/app/(dashboard)/expat/page.tsx`
- **Probleme :** Aucun `useTranslations`. Tous les textes sont hardcodes : "Guide Expatriation", "Salaires, cout de la vie et demarches administratives par pays", "Destination", "Niveau de vie", "Loyer 1ch (centre-ville)", "Transports", "Alimentation", "Indice cout de vie", "Salaires medians bruts annuels", "Domaine", "Demarches administratives", "Site officiel", "Des questions sur votre expatriation ?", "Demander au Coach", etc.
- **Impact client :** Page guide expatriation inutilisable hors FR.
- **Fix :** Externaliser dans namespace `dashboard.expat`.

### I02 -- Page salons : labels filtres hardcodes en francais
- **Fichier :** `frontend-next/src/app/(dashboard)/salons/page.tsx:276-388,649-686,734`
- **Probleme :** Bien que la page utilise `useTranslations` pour le gros du contenu, les labels des filtres Select sont hardcodes : "Region", "Secteur", "Toutes les regions", "Tous les secteurs", "Tous publics", "Etudiants", "Professionnels", "Seniors", "Reconversion", "Tous types", "Physique", "Virtuel", "Hybride". Aussi les micro-labels dans les EventCards : "Date", "Lieu", "Horaires", "entreprises".
- **Impact client :** Mixte FR/EN si l'utilisateur switch de langue.
- **Fix :** Ajouter ces cles dans le namespace `dashboard.salons`.

### I03 -- Page pricing : temoignages et FAQs hardcodes
- **Fichier :** `frontend-next/src/app/pricing/page.tsx:53-111`
- **Probleme :** Aucun `useTranslations` sur cette page. Temoignages (Marie L., Thomas D., Sophie M.) et 6 FAQs entierement en francais hardcode. Messages toast ("Vous utilisez deja ce plan", "Vous devez etre connecte", "Redirection vers le paiement...") aussi hardcodes.
- **Impact client :** Page critique de conversion completement FR-only.
- **Fix :** Creer namespace `pricing` avec toutes les cles.

### I04 -- SubscriptionCard : textes largement hardcodes
- **Fichier :** `frontend-next/src/components/profile/subscription-card.tsx:38-84,262-493`
- **Probleme :** Noms de plans ("Gratuit", "Starter", "Pro", "Premium"), descriptions, labels de features ("Filtres avances", "Favoris illimites", etc.), labels de quotas ("Analyses CV", "Messages Assistant"), banners ("Paiement en echec", "Annulation programmee"), CTAs ("Debloquez tout le potentiel", "Voir les plans", "Passer a X", "Changer de plan", "Reactiver mon abonnement") -- tous hardcodes.
- **Impact client :** Page profil mixte FR/EN lors du switch de langue.
- **Fix :** Externaliser dans namespace `profile.subscription`.

### I05 -- Documents page : textes partiellement hardcodes
- **Fichier :** `frontend-next/src/app/(dashboard)/documents/page.tsx:77,79,83,85,113-149,302-303,315,348-349,384,421`
- **Probleme :** Utilise `useTranslations` pour certains textes mais pas tous. Hardcodes : "Profil mis a jour !", "Erreur lors de la sauvegarde du profil.", "Profil supprime.", "Mes profils CV", "Reutilisez votre profil pour generer des documents adaptes", "Creer un profil", "Aucun profil CV cree", "Creez votre profil une fois...", "Modifier", "Modifie le", "Previsualiser", "Voir l'offre", "Entreprise non precisee", "Parcourir les offres", "Creer mon premier profil".
- **Impact client :** Mixte FR/EN.
- **Fix :** Completer le namespace `dashboard.documents`.

### I06 -- Lien mort `/contact` dans le footer dashboard
- **Fichier :** `frontend-next/src/app/(dashboard)/layout.tsx:54`
- **Probleme :** Le footer contient un lien `<a href="/contact">Contact</a>` mais aucune page `app/contact/page.tsx` n'existe. L'utilisateur obtient un 404.
- **Impact client :** Lien casse visible sur chaque page du dashboard.
- **Fix :** Creer la page contact ou rediriger vers `mailto:contact@huntzenjobs.co` (deja utilise dans la sidebar).

### I07 -- Pages dashboard sans metadata SEO dediee
- **Fichier :** Pas de layout.tsx avec metadata pour : `profile/`, `saved-jobs/`, `candidatures/`, `documents/`, `referral/`, `expat/`, `recruiter-contact/success/`
- **Probleme :** Ces pages heritent de la metadata globale generique. Pas de titre de page specifique (<title> reste "HuntZen Jobs - Votre allie carriere") quand on navigue sur ces pages.
- **Impact client :** Mauvaise UX -- l'onglet du navigateur ne reflette pas la page courante. SEO minimal (mais pages protegees par auth, donc impact SEO faible).
- **Fix :** Ajouter `layout.tsx` avec metadata pour chaque page dashboard restante, ou utiliser `generateMetadata`.

### I08 -- console.log en production
- **Fichier :** `frontend-next/src/components/jobs/job-details-modal.tsx:159`
- **Probleme :** `console.log("Job view tracked...")` visible dans la console prod.
- **Impact client :** Bruit dans la console, non professionnel.
- **Fix :** Supprimer ou remplacer par un log conditionnel dev-only.

### I09 -- console.error expose en production
- **Fichier :** `frontend-next/src/app/(dashboard)/saved-jobs/page.tsx:101`
- **Probleme :** `console.error("Failed to remove saved job:", error)` expose des details d'erreur dans la console utilisateur.
- **Impact client :** Faible, mais non professionnel.
- **Fix :** Utiliser Sentry pour capturer et supprimer le console.error.

### I10 -- catch {} silencieux (erreurs avalees)
- **Fichier :** `frontend-next/src/app/(dashboard)/candidatures/page.tsx:151,160`
- **Fichier :** `frontend-next/src/app/(dashboard)/jobs/page.tsx:614,719,895`
- **Probleme :** Des `catch {}` vides signifient que si l'update de statut ou la suppression de candidature echoue, l'utilisateur ne voit AUCUN feedback. L'action semble reussir alors qu'elle a echoue.
- **Impact client :** L'utilisateur pense avoir supprime/modifie une candidature alors que ce n'est pas le cas.
- **Fix :** Ajouter `toast.error("Erreur, veuillez reessayer")` dans chaque catch.

### I11 -- window.location.href au lieu de router.push pour navigation interne
- **Fichier :** `frontend-next/src/app/(dashboard)/saved-jobs/page.tsx:135,250`
- **Probleme :** Utilise `window.location.href = "/login"` et `window.location.href = "/jobs"` au lieu de `router.push()`. Cela force un full page reload au lieu d'une navigation SPA.
- **Impact client :** Transition brusque, perte du state React, experience lente.
- **Fix :** Remplacer par `router.push("/login")` et `router.push("/jobs")`.

---

## AMELIORATIONS

### A01 -- Pas de viewport meta explicite dans metadata
- **Fichier :** `frontend-next/src/lib/seo/metadata.ts`
- **Probleme :** Le viewport n'est pas defini dans les metadata Next.js. Next.js 14 genere un viewport par defaut, mais il ne contient pas `maximum-scale=1` qui empeche le zoom involontaire sur les inputs iOS.
- **Fix :** Ajouter `export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 }` dans le root layout.

### A02 -- Pas de safe-area-inset pour iOS
- **Fichier :** `frontend-next/src/app/(dashboard)/layout.tsx`
- **Probleme :** Pas de `env(safe-area-inset-bottom)` sur le contenu principal. Sur iPhone avec notch/Dynamic Island, le contenu peut etre masque par la barre Home.
- **Fix :** Ajouter `pb-[env(safe-area-inset-bottom)]` sur le main content.

### A03 -- Badge "Nouveau" hardcode sur Candidatures
- **Fichier :** `frontend-next/src/components/layout/sidebar.tsx:109`
- **Probleme :** Le badge "Nouveau" sur le lien Candidatures est hardcode en francais (`"Nouveau"`).
- **Fix :** Utiliser `t("badges.new")`.

### A04 -- Textes hardcodes dans la sidebar footer
- **Fichier :** `frontend-next/src/app/(dashboard)/layout.tsx:44-57`
- **Probleme :** Les textes du footer dashboard ("Confidentialite", "CGU", "Contact") sont hardcodes en francais au lieu d'utiliser `useTranslations`.
- **Fix :** Ce fichier est un Server Component async. Utiliser `getTranslations` pour externaliser.

### A05 -- Delete/actions sans confirmation sur candidatures
- **Fichier :** `frontend-next/src/app/(dashboard)/candidatures/page.tsx:345-351`
- **Probleme :** Le bouton "Supprimer" une candidature n'a pas de dialog de confirmation. Un clic accidentel supprime definitivement la candidature.
- **Fix :** Ajouter un `AlertDialog` de confirmation comme pour le logout.

### A06 -- Bouton delete sans confirmation sur documents
- **Fichier :** `frontend-next/src/app/(dashboard)/documents/page.tsx:450-459`
- **Probleme :** Meme probleme : suppression de document sans confirmation.
- **Fix :** Ajouter un dialog de confirmation.

### A07 -- Pas de scroll-lock explicite sur mobile menu
- **Fichier :** `frontend-next/src/components/layout/sidebar.tsx:464-484`
- **Probleme :** Quand le menu mobile s'ouvre, le body reste scrollable derriere le backdrop. Sur mobile, l'utilisateur peut accidentellement scroller le contenu derriere le menu.
- **Fix :** Ajouter `document.body.style.overflow = 'hidden'` quand `isMobileMenuOpen` est true.

### A08 -- Focus trap absent sur le mobile menu
- **Fichier :** `frontend-next/src/components/layout/sidebar.tsx:477-484`
- **Probleme :** Le menu mobile n'a pas de focus trap. L'utilisateur avec clavier peut tab en dehors du menu ouvert.
- **Fix :** Ajouter un focus trap (ex: `@radix-ui/react-focus-scope` deja installe via Dialog).

### A09 -- Saved jobs : pas de pagination
- **Fichier :** `frontend-next/src/app/(dashboard)/saved-jobs/page.tsx`
- **Probleme :** Tous les jobs sauvegardes sont charges et affiches en une seule liste. Avec 50+ jobs, la page peut devenir lente.
- **Fix :** Ajouter une pagination cote Supabase (range) ou un "Load more".

---

## CE QUI FONCTIONNE BIEN

- **Sidebar responsive** : Mobile hamburger avec animation spring, backdrop, close on click. Desktop sidebar fixe avec indicateur actif anime (`layoutId`). Bien implementee.
- **Etats loading** : Loading states avec skeletons sur la majorite des pages (jobs, saved-jobs, salons, cv-analysis, documents, referral, candidatures). Loading.tsx Next.js present pour les routes principales.
- **Etats empty** : Messages empty state avec CTAs pertinents sur la plupart des pages (saved-jobs, documents, salons, candidatures).
- **Toasts** : Utilisation correcte de `sonner` pour les feedbacks sur la majorite des actions (save, delete, etc.).
- **Pricing modal** : Utilise `Dialog` Radix (fermeture Escape, backdrop click, animation). Pas de console.log.
- **Formulaire recruiter-contact** : Validation en temps reel (onBlur), messages d'erreur clairs, submit disabled pendant loading, aria-invalid pour accessibilite.
- **Dashboard layout** : Suspense boundary avec fallback, SubscriptionProvider, UpgradeBanner pour conversion.
- **Navigation** : Tous les liens sidebar sont fonctionnels (pas de `href="#"` detecte). Liens premium correctement verrouilles avec modal pricing.
- **Auth guard** : Pages protegees avec redirect login cote serveur (profile) et cote client (cv-analysis, assistant).
- **Usage counters** : Compteurs de quota visibles et fonctionnels sur les pages principales.
- **Logout** : Confirmation dialog avant deconnexion.
- **Metadata SEO** : Present sur les pages principales (jobs, cv-analysis, assistant, salons) via layouts dedies.
- **PWA meta tags** : Manifest, apple-mobile-web-app-capable, theme-color corrects.
- **Preconnect** : DNS prefetch et preconnect pour Supabase et Railway.

---

## Calcul du score

- 4 BLOQUANTS x 20pts = -80
- 11 IMPORTANTS x 5pts = -55
- 9 AMELIORATIONS x 1pt = -9

Total brut : 100 - 80 - 55 - 9 = -44 -> plafond a **40/100**

Les bloquants (alert() natifs, zero i18n sur 3 pages, aucun error.tsx) tirent fortement le score vers le bas. La base technique est saine (sidebar, loading states, toasts) mais le produit n'est pas pret pour des clients non-francophones et manque de resilience aux erreurs.
