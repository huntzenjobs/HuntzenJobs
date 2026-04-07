# i18n TODO — HuntZen Sprint A
Date : 2026-03-18

## Résumé
- Total strings hardcodés détectés : ~185
- Pages dashboard : ~30
- Pages publiques : ~120 (about, faq, blog, temoignages massifs)
- Toasts hors admin : ~45
- Placeholders : ~55
- Aria-labels / title : ~35

---

## Strings par fichier

---

### frontend-next/src/contexts/subscription-context.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 125 | "Abonnement synchronisé" | subscription.toasts.synced | toast |
| 126 | "Vos informations d'abonnement ont été actualisées." | subscription.toasts.syncedDesc | toast |
| 129 | "Synchronisation impossible" | subscription.toasts.syncError | toast |
| 130 | "La fonction de synchronisation n'est pas disponible." | subscription.toasts.syncErrorDesc | toast |
| 216 | "Session expirée" | subscription.toasts.sessionExpired | toast |
| 217 | "Votre session a expiré. Veuillez vous reconnecter." | subscription.toasts.sessionExpiredDesc | toast |
| 219 | "Reconnecter" | subscription.toasts.reconnect | toast |

### frontend-next/src/app/(dashboard)/profile/profile-client.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 94 | "Lien copié !" | profile.referral.linkCopied | toast |
| 141 | "Clics" | profile.referral.stats.clicks | text |
| 145 | "Inscriptions" | profile.referral.stats.signups | text |
| 147 | "Conversions" | profile.referral.stats.conversions | text |
| 162 | "Comment ça marche ?" + bloc explicatif | profile.referral.howItWorks | text |
| 239 | "Paiement en échec" / "Annulation programmée" | profile.subscription.pastDue / profile.subscription.cancelScheduled | text |

### frontend-next/src/app/(dashboard)/candidatures/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 227 | "Tous les statuts" | candidatures.filters.allStatuses | text |
| 340 | title="Voir l'offre" | candidatures.actions.viewOffer | title |
| 348 | title="Supprimer" | candidatures.actions.delete | title |

### frontend-next/src/app/(dashboard)/salons/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 276 | "Région" | salons.filters.region | label |
| 284 | "Toutes les régions" | salons.filters.allRegions | placeholder |
| 301 | "Secteur" | salons.filters.sector | label |
| 309 | "Tous les secteurs" | salons.filters.allSectors | placeholder |
| 312 | "Tous les secteurs" | salons.filters.allSectors | text |
| 324 | "Public" | salons.filters.public | label |
| 332-342 | "Tous publics", "Étudiants", "Professionnels", "Seniors", "Tous" | salons.filters.audience.* | text |
| 349 | "Type" | salons.filters.type | label |
| 357-360 | "Tous types" | salons.filters.allTypes | text |
| 374 | "Format" | salons.filters.format | label |
| 382-388 | "Tous formats", "Physique", "Virtuel", "Hybride" | salons.filters.format.* | text |

### frontend-next/src/app/(dashboard)/recruiter-contact/success/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 59 | "Retour" | recruiterContact.success.back | text |
| 98 | "Rechercher des offres" | recruiterContact.success.searchJobs | text |

### frontend-next/src/app/(dashboard)/recruiter-contact/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 341 | placeholder="Jean Dupont" | recruiterContact.form.namePlaceholder | placeholder |
| 363 | placeholder="jean.dupont@example.com" | recruiterContact.form.emailPlaceholder | placeholder |

### frontend-next/src/app/(dashboard)/documents/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 77 | "Profil mis à jour !" | documents.toasts.profileUpdated | toast |
| 81 | "Profil sauvegardé !" | documents.toasts.profileSaved | toast |
| 83 | "Erreur lors de la sauvegarde du profil." | documents.toasts.saveError | toast |
| 91 | "Profil supprimé." | documents.toasts.profileDeleted | toast |
| 348 | "Parcourir les offres" | documents.empty.browseJobs | text |
| 434 | title="Prévisualiser" | documents.actions.preview | title |
| 445 | title="Modifier" | documents.actions.edit | title |

### frontend-next/src/app/(dashboard)/jobs/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 1704 | title="Actualiser les résultats depuis le serveur" | jobs.actions.refresh | title |
| 1766 | placeholder="Trier" | jobs.sort.placeholder | placeholder |
| 1769 | "Pertinence" | jobs.sort.relevance | text |
| 1770 | "Plus récent" | jobs.sort.newest | text |
| 1771 | "Plus ancien" | jobs.sort.oldest | text |
| 1960 | placeholder="ex: 35000" | jobs.filters.salaryPlaceholder | placeholder |
| 2194 | "Trouver les recruteurs" | jobs.recruiterFinder.title | text |

### frontend-next/src/app/(dashboard)/assistant/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 771 | title="Retirer le CV" | assistant.actions.removeCV | title |
| 795 | title="Joindre votre CV (PDF)" | assistant.actions.attachCV | title |

---

## Composants

### frontend-next/src/components/profile/settings-section.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 75 | "Erreur lors de la mise à jour des paramètres" | settings.toasts.updateError | toast |
| 82 | "Une erreur inattendue est survenue" | settings.toasts.unexpectedError | toast |
| 105 | "Déconnexion réussie" | settings.toasts.logoutSuccess | toast |
| 108 | "Erreur lors de la déconnexion" | settings.toasts.logoutError | toast |
| 190 | placeholder="Sélectionner une langue" | settings.language.placeholder | placeholder |
| 193-194 | "Français", "English" | settings.language.fr / settings.language.en | text |
| 232 | aria-label="Activer les notifications par email" | settings.aria.emailNotifications | aria |
| 287 | aria-label="S'abonner à la newsletter HuntZen" | settings.aria.newsletter | aria |

### frontend-next/src/components/profile/notifications-section.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 87 | "Erreur lors de la sauvegarde des préférences" | notifications.toasts.saveError | toast |

### frontend-next/src/components/profile/profile-form.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 79 | "Erreur lors de la mise à jour du profil" | profile.toasts.updateError | toast |
| 83 | "Profil mis à jour avec succès" | profile.toasts.updateSuccess | toast |
| 92 | "Une erreur inattendue est survenue" | profile.toasts.unexpectedError | toast |
| 112 | "Déconnexion réussie" | profile.toasts.logoutSuccess | toast |
| 117 | "Erreur lors de la déconnexion" | profile.toasts.logoutError | toast |
| 126 | "Nom complet" | profile.form.fullName | label |
| 132 | placeholder="Votre nom complet" | profile.form.fullNamePlaceholder | placeholder |
| 143 | "Email" | profile.form.email | label |

### frontend-next/src/components/profile/avatar-upload.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 96 | "Erreur lors de l'upload" | profile.avatar.uploadError | toast |
| 101 | "Photo de profil mise à jour" | profile.avatar.updated | toast |
| 122 | "Une erreur est survenue" | profile.avatar.genericError | toast |
| 160 | aria-label="Changer votre photo de profil" | profile.avatar.aria.change | aria |
| 173 | aria-label="Upload en cours" | profile.avatar.aria.uploading | aria |
| 187 | aria-label="Sélectionner une image de profil" | profile.avatar.aria.select | aria |

### frontend-next/src/components/profile/user-profile-widget.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 254 | "Utilisation du jour" | profile.widget.dailyUsage | text |

### frontend-next/src/components/profile/subscription-card.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 489 | aria-label="Voir tous les plans d'abonnement disponibles" | subscription.aria.viewPlans | aria |
| 506 | aria-label="Changer de plan d'abonnement" | subscription.aria.changePlan | aria |
| 516 | aria-label="Réactiver mon abonnement" | subscription.aria.reactivate | aria |

### frontend-next/src/components/coach/export-dialog.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 63 | "PDF généré avec succès !" | coach.export.toasts.pdfSuccess | toast |
| 67 | "Markdown exporté avec succès !" | coach.export.toasts.mdSuccess | toast |
| 98 | "Exporter la conversation" | coach.export.title | text |
| 107 | "Format d'export" | coach.export.formatLabel | label |

### frontend-next/src/components/coach/conversation-list-item.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 113 | aria-label="Supprimer la conversation" | coach.conversations.aria.delete | aria |
| 124 | "Supprimer la conversation ?" | coach.conversations.deleteTitle | text |
| 131 | "Annuler" | coach.conversations.cancel | text |

### frontend-next/src/components/coach/history-sidebar.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 144 | placeholder="Rechercher... (Cmd/Ctrl + K)" | coach.history.searchPlaceholder | placeholder |

### frontend-next/src/components/coach/quick-questions-drawer.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 110 | aria-label="Ouvrir les questions rapides" | coach.quickQuestions.aria.open | aria |
| 141 | aria-label="Mélanger les questions" | coach.quickQuestions.aria.shuffle | aria |
| 152 | aria-label="Réduire le panneau" | coach.quickQuestions.aria.collapse | aria |

### frontend-next/src/components/support/support-ticket-form.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 45 | "Fichier trop volumineux (max 5MB)" | support.toasts.fileTooLarge | toast |
| 49 | "Format non supporté. Images ou PDF uniquement." | support.toasts.invalidFormat | toast |
| 67 | "Erreur lors de l'upload du fichier" | support.toasts.uploadError | toast |
| 75 | "Sujet trop court (min 5 caractères)" | support.toasts.subjectTooShort | toast |
| 79 | "Description trop courte (min 20 caractères)" | support.toasts.descTooShort | toast |
| 175 | placeholder="Décrivez brièvement votre demande" | support.form.subjectPlaceholder | placeholder |
| 187 | placeholder="Décrivez en détail votre problème ou question..." | support.form.descPlaceholder | placeholder |

### frontend-next/src/components/support/support-chatbot.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 141 | placeholder="Posez votre question..." | support.chatbot.placeholder | placeholder |

### frontend-next/src/components/support/support-bubble.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 23 | aria-label="Aide et Support" | support.bubble.aria | aria |
| 24 | title="Aide & Support" | support.bubble.title | title |

### frontend-next/src/components/support/support-widget.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 70 | aria-label="Réduire" | support.widget.aria.minimize | aria |
| 77 | aria-label="Fermer" | support.widget.aria.close | aria |

### frontend-next/src/components/jobs/search-form-inline.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 202 | "Veuillez remplir tous les champs requis" | jobs.search.toasts.fieldsRequired | toast |
| 262 | placeholder="Métier ou poste recherché" | jobs.search.jobPlaceholder | placeholder |
| 301 | placeholder="Pays" | jobs.search.countryPlaceholder | placeholder |
| 319 | placeholder="Ville, département ou région (optionnel)" | jobs.search.locationPlaceholder | placeholder |
| 402 | placeholder="Métier ou poste recherché" | jobs.search.jobPlaceholderMobile | placeholder |
| 440 | placeholder="Pays" | jobs.search.countryPlaceholderMobile | placeholder |
| 456 | placeholder="Ville, département ou région (optionnel)" | jobs.search.locationPlaceholderMobile | placeholder |

### frontend-next/src/components/jobs/apply-modal.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 539 | "Veuillez sélectionner votre CV avant de continuer." | jobs.apply.toasts.selectCV | toast |
| 545 | "Veuillez sélectionner un profil sauvegardé." | jobs.apply.toasts.selectProfile | toast |
| 577 | "Impossible de charger la prévisualisation" | jobs.apply.toasts.previewError | toast |
| 579 | "Erreur lors de la prévisualisation" | jobs.apply.toasts.previewGenericError | toast |
| 591 | "Profil sauvegardé !" | jobs.apply.toasts.profileSaved | toast |
| 593 | "Erreur lors de la sauvegarde du profil." | jobs.apply.toasts.profileSaveError | toast |
| 1195 | title="Prévisualisation CV" | jobs.apply.previewTitle | title |
| 1304 | title="Modifier le contenu du CV adapté..." | jobs.apply.editCVTitle | title |
| 1334 | title="Modifier le CV adapté — la lettre..." | jobs.apply.editCVWithLMTitle | title |
| 1386 | "Candidature marquée comme envoyée !" | jobs.apply.toasts.applicationSent | toast |

### frontend-next/src/components/jobs/recruiter-finder-drawer.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 74 | "Email copié !" | jobs.recruiter.toasts.emailCopied | toast |
| 82 | title="Copier l'email" | jobs.recruiter.copyEmailTitle | title |
| 188 | "Impossible de récupérer les contacts..." | jobs.recruiter.toasts.fetchError | toast |

### frontend-next/src/components/jobs/job-details-modal.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 244 | "Impossible d'enregistrer la candidature..." | jobs.details.toasts.saveError | toast |
| 579 | aria-label="Comment ça fonctionne ?" | jobs.details.aria.howItWorks | aria |

### frontend-next/src/components/jobs/advanced-filters-modal.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 252 | placeholder="Rechercher une industrie..." | jobs.filters.industryPlaceholder | placeholder |
| 306 | placeholder="Ex: React, Python, AWS..." | jobs.filters.skillsPlaceholder | placeholder |
| 357 | placeholder="Sélectionner un niveau..." | jobs.filters.levelPlaceholder | placeholder |

### frontend-next/src/components/recruiter/recruiter-contact-modal.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 178 | "Paiement sécurisé par Stripe" | recruiter.modal.securePayment | text |
| 192 | placeholder="Jean Dupont" | recruiter.modal.namePlaceholder | placeholder |
| 207 | placeholder="jean.dupont@example.com" | recruiter.modal.emailPlaceholder | placeholder |
| 239 | placeholder="Sélectionnez" | recruiter.modal.selectPlaceholder | placeholder |
| 243-248 | "Finance", "Marketing", "Commercial", "RH", "Ingénierie", "Autre" | recruiter.modal.sectors.* | text |
| 261 | placeholder="Sélectionnez" | recruiter.modal.selectPlaceholder2 | placeholder |
| 276 | placeholder="Décrivez votre situation..." | recruiter.modal.descPlaceholder | placeholder |

### frontend-next/src/components/recruiter/recruiter-email-finder.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 86 | placeholder="Nom de l'entreprise" | recruiter.emailFinder.companyPlaceholder | placeholder |

### frontend-next/src/components/freemium/usage-modal.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 257 | "Réinitialisation à minuit" | freemium.usage.resetAtMidnight | text |
| 264 | title="Analyses CV" | freemium.usage.cvAnalyses | title |
| 273 | title="Messages Assistant" | freemium.usage.assistantMessages | title |
| 283 | title="Recherches d'emploi" | freemium.usage.jobSearches | title |

### frontend-next/src/components/error-boundary.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 69 | "Oups, une erreur s'est produite" | errors.boundary.title | text |

### frontend-next/src/components/auth/unlock-overlay.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 167 | "Créer un compte" | auth.unlock.createAccount | text |

### frontend-next/src/components/theme/theme-toggle.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 39 | aria-label="Changer le thème" | theme.aria.toggle | aria |
| 73 | "Clair" | theme.light | text |
| 88 | "Sombre" | theme.dark | text |
| 103 | "Système" | theme.system | text |

### frontend-next/src/components/documents/document-edit-dialog.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 227 | "Modifier le CV" | documents.edit.title | text |
| 361 | placeholder="Ex: 2022-01" | documents.edit.startDatePlaceholder | placeholder |
| 372 | placeholder="Ex: 2024-06 ou Présent" | documents.edit.endDatePlaceholder | placeholder |

### frontend-next/src/components/cv/cv-upload-async.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 112-124 | "Score ATS détaillé...", "Analyse de compatibilité...", "Sauvegarde..." | cv.upload.features.* | text |
| 158 | "Gratuit sans CB" | cv.upload.freeNoCB | text |
| 286 | placeholder="Collez la description du poste..." | cv.upload.jobDescPlaceholder | placeholder |
| 336 | placeholder="Collez la description du poste..." | cv.upload.jobDescPlaceholder2 | placeholder |
| 401 | "Téléchargement vers Supabase Storage" | cv.upload.steps.uploading | text |
| 412 | "Extraction du texte" | cv.upload.steps.extracting | text |
| 421 | "Analyse du contenu" | cv.upload.steps.analyzing | text |
| 493-497 | "Sauvegarde...", "Accès à toutes les fonctionnalités..." | cv.upload.perks.* | text |
| 595-661 | Blocs pricing Starter/Pro/Premium | cv.upload.pricing.* | text |

### frontend-next/src/components/cv/cv-upload-async-wizard.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 340-382 | Même pattern que cv-upload-async — features + pricing | cv.wizard.features.* | text |
| 795 | placeholder="Collez le contenu de votre CV..." | cv.wizard.cvPastePlaceholder | placeholder |
| 907 | placeholder="Collez la description du poste..." | cv.wizard.jobDescPlaceholder | placeholder |
| 1092 | title="Modifier le CV adapté" | cv.wizard.editAdaptedCV | title |
| 1126 | title="Modifier la lettre de motivation" | cv.wizard.editCoverLetter | title |

### frontend-next/src/components/cv/wizard/step1-upload.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 90 | "Coller le texte" | cv.wizard.step1.pasteTab | text |
| 103 | placeholder="Collez ici le contenu de votre CV..." | cv.wizard.step1.pastePlaceholder | placeholder |

### frontend-next/src/components/cv/wizard/step2-analysis-type.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 114 | placeholder="Collez ici la description complète de l'offre..." | cv.wizard.step2.jobDescPlaceholder | placeholder |

### frontend-next/src/components/cv-builder/cv-builder-wizard.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 159 | placeholder="Mon CV principal" | cvBuilder.namePlaceholder | placeholder |

### frontend-next/src/components/cv-builder/steps/step-personal-info.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 26 | placeholder="Marie Dupont" | cvBuilder.personal.namePlaceholder | placeholder |
| 32 | placeholder="Développeur Full-Stack" | cvBuilder.personal.titlePlaceholder | placeholder |
| 46 | placeholder="marie@exemple.com" | cvBuilder.personal.emailPlaceholder | placeholder |
| 51 | "Téléphone" | cvBuilder.personal.phone | label |
| 63 | "Localisation" | cvBuilder.personal.location | label |
| 64 | placeholder="Paris, France" | cvBuilder.personal.locationPlaceholder | placeholder |
| 67 | "LinkedIn" | cvBuilder.personal.linkedin | label |
| 70 | placeholder="linkedin.com/in/marie-dupont" | cvBuilder.personal.linkedinPlaceholder | placeholder |

### frontend-next/src/components/cv-builder/steps/step-experiences.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 120 | placeholder="Développeur Full-Stack" | cvBuilder.exp.titlePlaceholder | placeholder |
| 131 | placeholder="Google" | cvBuilder.exp.companyPlaceholder | placeholder |
| 140 | placeholder="janv. 2022" | cvBuilder.exp.startPlaceholder | placeholder |
| 149 | placeholder="déc. 2023" | cvBuilder.exp.endPlaceholder | placeholder |
| 169 | placeholder="Paris, France" | cvBuilder.exp.locationPlaceholder | placeholder |
| 179 | placeholder="Développement et maintenance..." | cvBuilder.exp.descPlaceholder | placeholder |

### frontend-next/src/components/cv-builder/steps/step-summary.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 20 | placeholder="Développeur passionné avec 5 ans..." | cvBuilder.summary.placeholder | placeholder |

### frontend-next/src/components/cv-builder/steps/step-skills.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 91 | "Compétences techniques" | cvBuilder.skills.technical | label |
| 94 | placeholder="React, Python, SQL..." | cvBuilder.skills.technicalPlaceholder | placeholder |
| 132 | "Compétences comportementales" | cvBuilder.skills.soft | label |
| 135 | placeholder="Leadership, Travail en équipe..." | cvBuilder.skills.softPlaceholder | placeholder |
| 173 | "Langues" | cvBuilder.skills.languages | label |
| 176 | placeholder="Français, Anglais..." | cvBuilder.skills.languagePlaceholder | placeholder |
| 183 | placeholder="Niveau" | cvBuilder.skills.levelPlaceholder | placeholder |

### frontend-next/src/components/cv-builder/steps/step-education.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 79 | placeholder="Master Informatique" | cvBuilder.edu.degreePlaceholder | placeholder |
| 90 | placeholder="Université Paris-Saclay" | cvBuilder.edu.schoolPlaceholder | placeholder |
| 99 | placeholder="Intelligence Artificielle" | cvBuilder.edu.fieldPlaceholder | placeholder |

### frontend-next/src/components/seo/internal-links.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 88-104 | Blocs texte SEO avec "HuntZen Jobs est la plateforme N°1..." | seo.internalLinks.* | text |

### frontend-next/src/components/seo/breadcrumbs.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 52 | aria-label="Fil d'Ariane" | seo.breadcrumbs.aria | aria |

### frontend-next/src/components/ui/skeleton-loader.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 15-74 | aria-label="Chargement..." (x5) | ui.skeleton.aria.loading | aria |

### frontend-next/src/components/ui/autocomplete-input.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 324 | aria-label="Chargement..." | ui.autocomplete.aria.loading | aria |
| 337 | aria-label="Effacer" | ui.autocomplete.aria.clear | aria |

---

## Pages publiques (contenu SEO massif — hardcodé intentionnellement ?)

### frontend-next/src/app/about/page.tsx
~40 blocs de texte hardcodé (lignes 39-401). Tout le contenu SEO "HuntZen Jobs" est inline.
**Recommandation** : externaliser dans messages/{fr,en}.json sous `about.*`

### frontend-next/src/app/faq/faq-data.ts
~60 Q&A hardcodés (lignes 8-264). Tout le contenu FAQ est dans un fichier TS.
**Recommandation** : externaliser dans messages/{fr,en}.json sous `faq.*`

### frontend-next/src/app/faq/faq-client.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 52 | "Tout ce que vous devez savoir sur HuntZen Jobs..." | faq.subtitle | text |
| 61 | placeholder="Rechercher une question sur HuntZen Jobs..." | faq.searchPlaceholder | placeholder |

### frontend-next/src/app/blog/page.tsx
~15 strings hardcodés (titres articles, catégories, descriptions). Lignes 17-65.
**Recommandation** : externaliser dans messages/{fr,en}.json sous `blog.*`

### frontend-next/src/app/temoignages/testimonials-data.ts
~50 témoignages hardcodés avec nom, rôle, titre, contenu, tags (lignes 22-264).
**Recommandation** : externaliser dans messages/{fr,en}.json sous `testimonials.*`

### frontend-next/src/app/temoignages/testimonials-client.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 131 | placeholder="Rechercher un témoignage..." | testimonials.searchPlaceholder | placeholder |

### frontend-next/src/app/contact/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 29 | "Merci de remplir tous les champs obligatoires." | contact.toasts.fillRequired | toast |
| 38 | "Une erreur est survenue. Veuillez réessayer..." | contact.toasts.genericError | toast |
| 152 | placeholder="Jean Dupont" | contact.form.namePlaceholder | placeholder |
| 165 | placeholder="jean@exemple.com" | contact.form.emailPlaceholder | placeholder |
| 196 | placeholder="Décrivez votre demande en détail..." | contact.form.descPlaceholder | placeholder |

### frontend-next/src/app/pricing/page.tsx
| Ligne | Texte hardcodé | Clé proposée | Type |
|-------|----------------|--------------|------|
| 188 | "Vous utilisez déjà ce plan" | pricing.toasts.alreadyOnPlan | toast |
| 193 | "Vous devez être connecté pour souscrire..." | pricing.toasts.mustLogin | toast |
| 199 | "Redirection vers le paiement..." | pricing.toasts.redirecting | toast |
| 211 | "Session expirée, veuillez vous reconnecter" | pricing.toasts.sessionExpired | toast |
| 246 | "Abonnement mis à niveau !" | pricing.toasts.upgraded | toast |

---

## Fichiers déjà correctement traduits (useTranslations présent)
- frontend-next/src/components/freemium/pricing-modal.tsx (toasts via tModal())
- frontend-next/src/components/freemium/conversion-popups.tsx (useTranslations)
- frontend-next/src/components/layout/cookie-banner.tsx (useTranslations)
- frontend-next/src/components/layout/footer.tsx (useTranslations)
- frontend-next/src/components/layout/sidebar.tsx (useTranslations)
- frontend-next/src/components/assistant/welcome-screen.tsx (useTranslations)
- frontend-next/src/components/assistant/bot-selector.tsx (useTranslations partiel)
- frontend-next/src/components/landing-header.tsx (useTranslations)
- frontend-next/src/components/notifications/notification-bell.tsx (aria hardcodé restant)
- frontend-next/src/components/career-score/career-score-card.tsx (aria hardcodé restant)

---

## Priorités de correction

### P0 — Critique (texte visible par tous les utilisateurs)
1. **subscription-context.tsx** — toasts session/sync (7 strings)
2. **pricing/page.tsx** — toasts checkout (5 strings)
3. **jobs/page.tsx** — tri, placeholders (5 strings)
4. **apply-modal.tsx** — toasts candidature (8 strings)
5. **search-form-inline.tsx** — placeholders recherche (7 strings)

### P1 — Important (composants fréquemment utilisés)
6. **profile-form.tsx** — toasts + labels (7 strings)
7. **settings-section.tsx** — toasts + labels (8 strings)
8. **support-ticket-form.tsx** — toasts + placeholders (7 strings)
9. **documents/page.tsx** — toasts + actions (7 strings)
10. **salons/page.tsx** — tous les filtres (20+ strings)

### P2 — Important (CV builder complet)
11. **cv-builder steps** — tous les placeholders et labels (~30 strings)
12. **cv-upload-async.tsx** — features marketing + steps (~15 strings)
13. **cv-upload-async-wizard.tsx** — idem (~15 strings)

### P3 — Pages publiques SEO (gros volume, moindre urgence)
14. **about/page.tsx** — ~40 blocs texte
15. **faq/faq-data.ts** — ~60 Q&A
16. **temoignages/testimonials-data.ts** — ~50 témoignages
17. **blog/page.tsx** — ~15 articles
