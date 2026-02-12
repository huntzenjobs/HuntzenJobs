'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Shield, Lock, Eye, FileText, ChevronRight } from 'lucide-react'
import { LandingHeader } from '@/components/landing-header'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero Section */}
      <div className="pt-20 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-[#00D9FF]/20 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-[#00D9FF]" />
              </div>
              <h1 className="text-4xl sm:text-5xl font-black">
                Politique de Confidentialité
              </h1>
            </div>
            <p className="text-xl text-white/80">
              Votre vie privée est notre priorité. Découvrez comment nous protégeons et utilisons vos données.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap gap-3">
            {[
              { icon: FileText, label: 'Collecte des données', href: '#collecte' },
              { icon: Eye, label: 'Vos droits', href: '#droits' },
              { icon: Lock, label: 'Sécurité', href: '#securite' },
            ].map((item, index) => (
              <motion.a
                key={index}
                href={item.href}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-200 hover:border-[#00D9FF] hover:bg-[#00D9FF]/5 transition-colors text-sm font-medium text-gray-700 hover:text-[#00D9FF]"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </motion.a>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="prose prose-lg max-w-none"
        >
          <div className="mb-12 p-6 bg-blue-50 border-l-4 border-[#00D9FF] rounded-r-lg">
            <p className="text-gray-700 leading-relaxed m-0">
              La présente Politique de Confidentialité réglemente le traitement des données à caractère personnel des utilisateurs (ci-après « Utilisateur » ou « Utilisateurs »), collectées dans le cadre de l'utilisation du site Internet <strong>https://huntzenjobs.fr</strong> (ci-après « Site »), par <strong>HUNTZEN, Unipessoal Lda.</strong>, Sociedade Unipessoal por Quotas au capital de 15.000,00 euros, dont le siège social est situé à Rua dos Lusíadas 5 5b, 1300-365 Lisboa, Portugal et titulaire du numéro d'identification de personne morale et d'immatriculation 516481320 (ci-après « HUNTZEN »), en tant qu'entité responsable du traitement.
            </p>
          </div>

          <section id="collecte" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">Collecte et traitement de données à caractère personnel</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>L'accès et la navigation sur le Site n'impliquent pas automatiquement la mise à disposition de données à caractère personnel par l'Utilisateur.</p>
              <p>Cependant, l'utilisation de certaines fonctionnalités du Site exige la mise à disposition de données à caractère personnel par l'Utilisateur. En effet, les données à caractère personnel des Utilisateurs sont collectées et traitées afin de répondre aux services proposés.</p>
              <p>Ces données collectées permettent de :</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Créer et gérer le compte-utilisateur</li>
                <li>Informer chacune des parties prenantes sur un recrutement donné</li>
                <li>Déclencher la facturation pour les clients et l'appel à facture pour les consultants</li>
                <li>Obtenir un support et une aide dans leurs démarches sur le Site</li>
                <li>Répondre aux questions que l'Utilisateur viendrait à se poser</li>
              </ul>
            </div>
          </section>

          <section id="droits" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">Droits de l'utilisateur</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>Conformément à la législation applicable, l'Utilisateur pourra demander, à tout moment, l'accès aux données à caractère personnel qui le concernent ainsi que leur rectification, leur effacement, la limitation de leur traitement, la portabilité de ses données ou s'opposer à leur traitement.</p>
              <p>L'Utilisateur peut également obtenir la confirmation du fait que les données à caractère personnel qui le concernent font l'objet d'un traitement, lui étant fournie, sur demande, une copie des données en cours de traitement.</p>
              <p>La loi garantit également à l'Utilisateur le droit de retirer son consentement vis-à-vis du traitement des données pour les finalités indiquées sans toutefois annuler le traitement effectué jusqu'à cette date sur la base du consentement donné précédemment.</p>
              <div className="bg-gray-50 rounded-lg p-6 mt-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Pour exercer vos droits, contactez-nous :</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span><strong>E-mail :</strong> contact@huntzenjobs.co</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span><strong>Adresse :</strong> Rua dos Lusíadas 5 5b, 1300-365 Lisboa, Portugal</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Conservation des données à caractère personnel</h2>
            <div className="space-y-4 text-gray-700">
              <p>Les données à caractère personnel collectées sont traitées conformément à la législation applicable.</p>
              <p>Les données à caractère personnel seront conservées selon leur finalité et conformément à la durée de conservation prévue par la loi applicable. Ainsi, lorsqu'il n'existe aucune exigence légale spécifique, les données seront stockées et conservées pour une période appropriée et pour les finalités pour lesquelles elles ont été collectées, sauf si l'Utilisateur décide d'exercer, dans les limites de la loi, le droit de retirer son consentement.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Dans quel cas les données sont-elles transmises à d'autres entités ?</h2>
            <div className="space-y-4 text-gray-700">
              <p>HUNTZEN pourra transmettre les données à caractère personnel :</p>
              <ul className="list-disc pl-6 space-y-3">
                <li>Lors du recours à des tiers pour la prestation de certains services, dès lors que la prestation de ces services puisse exiger l'accès, par ces entités, aux données à caractère personnel. Ainsi, toute entité sous-traitante d'HUNTZEN traitera vos données à caractère personnel, au nom et pour le compte d'HUNTZEN, selon la stricte obligation de suivre ses instructions et conformément à l'accord de sous-traitance conclu avec lesdites entités sous-traitantes.</li>
                <li>À des tiers, si elle entend que ces transmissions de données sont nécessaires ou appropriées (i) au regard de la loi, (ii) en vertu d'obligations légales/ordres judiciaires, (iii) de délibérations ou de décisions des autorités de contrôle ou (iv) pour répondre aux demandes d'autorités publiques ou gouvernementales.</li>
              </ul>
            </div>
          </section>

          <section id="securite" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <Lock className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">Sécurité</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>HUNTZEN fait tout ce qui en son pouvoir pour assurer la protection des données à caractère personnel des Utilisateurs face à des accès non-autorisés. À cette fin, elle utilise des systèmes de sécurité, des règles et d'autres procédures pour garantir la protection des données à caractère personnel, ainsi que pour empêcher l'accès non autorisé aux données ou leur utilisation abusive, leur divulgation, leur perte ou leur destruction.</p>
              <p>Cependant, les Utilisateurs sont responsables de garantir et d'assurer que les dispositifs et les équipements utilisés pour accéder au Site sont dûment protégés contre les logiciels malveillants, les virus informatiques et les vers.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Cookies</h2>
            <div className="space-y-4 text-gray-700">
              <h3 className="text-xl font-bold text-gray-900">Qu'est-ce qu'un cookie ?</h3>
              <p>Les cookies sont de petits fichiers ou dispositifs placés sur l'ordinateur des Utilisateurs qui permettent de conserver, de récupérer, de mettre à jour et de traiter les données relatives aux transactions effectuées sur le Site. Ces cookies sont mis sur l'HD des Utilisateurs et non sur le Site.</p>
              <p>Lors de la première visite sur le Site, il est proposé aux Utilisateurs d'accepter ou de refuser l'utilisation de certaines catégories de cookies.</p>
              <p>Sur le Site, sont utilisés les propres cookies d'HUNTZEN et ceux de tiers qui permettent d'effectuer de manière anonyme des analyses d'utilisation et de mesure afin de nous assurer que le Site fonctionne correctement et d'améliorer nos services.</p>

              <h3 className="text-xl font-bold text-gray-900 mt-8">Contrôle de l'utilisation des cookies</h3>
              <p>Si l'Utilisateur souhaite supprimer les cookies qui sont déjà installés sur son terminal, il peut le faire depuis son navigateur. Pour savoir comment procéder, il suffit de consulter l'aide de son navigateur, où se trouvent les étapes à suivre pour les supprimer.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Transferts internationaux de données</h2>
            <div className="space-y-4 text-gray-700">
              <p>HUNTZEN pourra transférer des données à caractère personnel vers des pays tiers (hors de l'Union européenne ou de l'Espace économique européen), dans le cadre des finalités prévues par la présente politique, pour lesquelles il n'existe aucune décision d'adéquation prise par la Commission Européenne.</p>
              <p>Dans ce cas, HUNTZEN s'engage à prendre les mesures de sécurité appropriées afin d'assurer la confidentialité et la protection des données à caractère personnel, conformément à la législation applicable en matière de protection des données à caractère personnel.</p>
              <p>L'Utilisateur peut demander des informations sur ces transferts en contactant contact@huntzenjobs.co.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Réclamations</h2>
            <div className="space-y-4 text-gray-700">
              <p>Sans préjudice de toute autre voie de recours administratif ou judiciaire, l'Utilisateur a le droit de présenter une réclamation à l'autorité de contrôle compétente conformément à la loi, lorsqu'il considère que le traitement de ses données par HUNTZEN viole le régime légal en vigueur.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Questions et suggestions</h2>
            <div className="space-y-4 text-gray-700">
              <p>L'Utilisateur peut contacter HUNTZEN vis-à-vis de toutes les questions concernant le traitement de ses données à caractère personnel et l'exercice des droits qui lui sont octroyés par la législation applicable :</p>
              <div className="bg-gray-50 rounded-lg p-6 mt-4">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span><strong>Téléphone :</strong> +351 21 111 9967 ou +33 (1) 84 19 26 61</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span><strong>E-mail :</strong> contact@huntzenjobs.co</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span><strong>Adresse :</strong> Rua dos Lusíadas 5 5b, 1300-365 Lisboa, Portugal</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Modification de la politique de confidentialité</h2>
            <div className="space-y-4 text-gray-700">
              <p>HUNTZEN se réserve le droit de modifier les présentes conditions de traitement des données à caractère personnel à tout moment. Ces modifications seront dès lors qu'elles seront rendues disponibles sur le Site, sans qu'aucune formalité ne soit requise.</p>
            </div>
          </section>

          <div className="mt-12 p-6 bg-gray-50 rounded-lg border-l-4 border-[#00D9FF]">
            <p className="text-sm text-gray-600 m-0">
              <strong>Dernière mise à jour :</strong> Janvier 2026
            </p>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-white font-bold text-xl tracking-tight">HuntZen</span>
                <span className="w-2 h-2 rounded-full bg-[#00D9FF] animate-pulse"></span>
              </div>
              <p className="text-white/70 text-sm">
                Une plateforme créée par un recruteur et un entrepreneur.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-4">Liens importants</h3>
              <ul className="space-y-2 text-sm text-white/70">
                <li><Link href="/" className="hover:text-[#00D9FF] transition-colors">Accueil</Link></li>
                <li><Link href="/pricing" className="hover:text-[#00D9FF] transition-colors">Tarifs</Link></li>
                <li><Link href="/terms" className="hover:text-[#00D9FF] transition-colors">Conditions générales</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-4">Contact</h3>
              <ul className="space-y-2 text-sm text-white/70">
                <li>+351 21 111 9967</li>
                <li>+33 (1) 84 19 26 61</li>
                <li>contact@huntzenjobs.co</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 text-center text-sm text-white/50">
            Copyright © 2026 Tous droits réservés HuntZen.
          </div>
        </div>
      </footer>

      <style jsx global>{`
        

        body {
          font-family: var(--font-dm-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .prose h2 {
          margin-top: 2rem;
          margin-bottom: 1rem;
        }

        .prose h3 {
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }

        .prose p {
          margin-bottom: 1rem;
        }

        .prose ul {
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  )
}
