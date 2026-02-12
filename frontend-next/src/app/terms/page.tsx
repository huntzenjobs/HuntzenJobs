'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Users, CreditCard, Scale, ChevronRight, AlertCircle } from 'lucide-react'
import { LandingHeader } from '@/components/landing-header'

export default function TermsPage() {
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
                <Scale className="w-6 h-6 text-[#00D9FF]" />
              </div>
              <h1 className="text-4xl sm:text-5xl font-black">
                Conditions Générales
              </h1>
            </div>
            <p className="text-xl text-white/80">
              Les règles d'utilisation de notre plateforme et de nos services.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap gap-3">
            {[
              { icon: Users, label: 'Profils utilisateurs', href: '#profils' },
              { icon: FileText, label: 'Description des services', href: '#services' },
              { icon: CreditCard, label: 'Prix et paiement', href: '#prix' },
              { icon: AlertCircle, label: 'Responsabilités', href: '#responsabilites' },
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
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Qui sommes-nous</h2>
            <div className="p-6 bg-blue-50 border-l-4 border-[#00D9FF] rounded-r-lg">
              <p className="text-gray-700 leading-relaxed m-0">
                Nous sommes <strong>HUNTZEN, Unipessoal Lda.</strong>, Sociedade Unipessoal por Quotas au capital de 15.000,00 euros, dont le siège social est situé à <strong>Rua dos Lusíadas 5 5b, 1300-365 Lisboa, Portugal</strong> et titulaire du numéro d'identification de personne morale et d'immatriculation <strong>516481320</strong> (ci-après « HUNTZEN », « nous », « notre ») et ce sont les Conditions Générales de Vente et d'Utilisations (CGVU) d'HUNTZEN.
              </p>
            </div>
            <div className="mt-6 space-y-4 text-gray-700">
              <p>Nous vous remercions de prendre quelques minutes pour lire nos CGVU du Site <strong>https://huntzenjobs.com</strong> (ci-après « Site »), édité par la société HUNTZEN.</p>
              <p>Les présentes CGVU contiennent des informations importantes pour vous en tant qu'utilisateur de notre Site et acheteur de nos services, et s'appliquent à tous les services utilisés ou achetés sur notre Site.</p>
              <p>Si vous avez des questions sur ces CGVU, vous pouvez nous contacter par courrier à l'adresse Rua dos Lusíadas 5 5b, 1300-365 Lisboa, Portugal, par email à l'adresse <strong>contact@huntzenjobs.co</strong> ou par téléphone :</p>
              <ul className="list-none pl-0 space-y-2">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                  <span>Téléphone PT : +351 21 111 9967</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                  <span>Téléphone FR : +33 (0)1 84 19 26 61</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Applicabilité des CGVU</h2>
            <div className="space-y-4 text-gray-700">
              <p>L'utilisation de ce Site, de tout sous-domaine connexe et de tous les services connexes, produits, offres et services, sont expressément soumis à votre acceptation des présentes CGVU. En utilisant notre Site ou en profitant de l'un de nos services, l'Utilisateur (« Client », « Recruteur » ou « Candidat ») accepte et respecte, sans réserve ni exception, automatiquement les présentes CGVU, y compris les modifications futures annoncées par publication sur notre Site ou qui sont notifiées d'une autre manière.</p>
              <p>HUNTZEN se réserve le droit de modifier à tout moment et sans préavis les CGVU sans qu'une notification préalable ne soit donnée. Les CGVU modifiées seront applicables dès qu'elles seront rendues accessibles, sans qu'aucune autre formalité ne soit requise.</p>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 m-0">
                    <strong>Important :</strong> Si l'Utilisateur n'approuve pas ou n'est pas d'accord avec ces CGVU, il ne peut pas utiliser ou accéder au Site, ou faire usage des services d'HUNTZEN.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Propriété intellectuelle</h2>
            <div className="space-y-4 text-gray-700">
              <p>Tous les contenus publiés sur le Site (y compris les logos, les marques, les droits d'auteur, etc.) sont la propriété intellectuelle exclusive de HUNTZEN et, sans l'autorisation expresse de HUNTZEN, ils ne peuvent être distribués, modifiés ou utilisés de quelque manière que ce soit.</p>
              <p>Toute reproduction, distribution, commercialisation ou transformation des contenus qui n'aura pas été expressément autorisée par leurs propriétaires, constitue une violation des droits de propriété intellectuelle et industrielle protégés par la loi et peut donner lieu aux actions administratives, civiles ou pénales compétentes en cas de violation de ces droits par le client.</p>
              <p>L'accès au Site et aux services et leur utilisation, n'opère aucun transfert de propriété à quelque titre que ce soit.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Contenu du Site</h2>
            <div className="space-y-4 text-gray-700">
              <p>Sur le Site, l'Utilisateur a la possibilité de souscrire les Services d'HUNTZEN. L'Utilisateur peut accéder sur le Site à une description des caractéristiques essentielles des services en fonction de son profil (Client, Recruteur, Candidat) et le concept qui sous-tend son élaboration.</p>
              <p>Ces services sont accessibles en langue portugaise, française et anglaise.</p>
            </div>
          </section>

          <section id="profils" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">Profils des Utilisateurs</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>L'utilisation du Site et les services sont différenciés en fonction du profil de l'Utilisateur :</p>

              <div className="grid gap-4 mt-6">
                <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-[#00D9FF]">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Client</h3>
                  <p className="m-0">Toute personne morale de droit privé ou de droit public, inscrite sur le Site, déposant une annonce sur le Site pour recevoir des candidatures par les comptes Recruteurs ou Candidats.</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-[#00D9FF]">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Recruteur</h3>
                  <p className="m-0">Toute personne physique ou morale, inscrite sur le Site, professionnel du recrutement, souhaitant présenter des Candidats aux Entreprises ayant diffusé une Annonce sur le Site. Ne peuvent être Recruteurs (et donc prétendre à la Prime) que les personnes qui ont soit une expérience du recrutement ou une formation en recrutement.</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-[#00D9FF]">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Candidat</h3>
                  <p className="m-0">Toute personne physique ayant été recommandée par un Recruteur et ayant accepté d'être potentiellement contactée par le Client.</p>
                </div>
              </div>
            </div>
          </section>

          <section id="services" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">Description des Services</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Pour le Client</h3>
                  <p>HUNTZEN permet, à travers de son Site, au Client de s'inscrire, publier des offres, les modifier et communiquer avec les Recruteurs via une plateforme dédiée, ainsi que leur permet d'organiser leurs recrutements.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Pour le Recruteur</h3>
                  <p>HUNTZEN permet, à travers de son Site, au Recruteur de s'inscrire, traiter les Curriculum Vitae (CV) reçus et envoyer les CV correspondants aux offres déposées par les Clients. En outre, les Recruteurs peuvent recevoir des primes lorsqu'ils ont participé au recrutement d'un Client.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Pour le Candidat</h3>
                  <p>HUNTZEN permet, à travers de son Site, au Candidat de s'inscrire, déposer un CV et s'organiser via la plateforme dédiée, et recevoir des primes si le CV envoyé est recruté dans les 6 mois.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Accès au Service</h2>
            <div className="space-y-4 text-gray-700">
              <p>HUNTZEN s'efforce de permettre l'accès au site 24 heures sur 24, 7 jours sur 7, sauf en cas de force majeure ou d'un événement hors de son contrôle, et sous réserve des éventuelles pannes et interventions de maintenance nécessaires au bon fonctionnement du Site et des services.</p>
              <p>Par conséquent, HUNTZEN ne peut garantir une disponibilité du site et/ou des services, une fiabilité des transmissions et des performances en termes de temps de réponse ou de qualité.</p>
              <p>La responsabilité d'HUNTZEN ne saurait être engagée en cas d'impossibilité d'accès à ce site et/ou d'utilisation des services.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Inscription</h2>
            <div className="space-y-4 text-gray-700">
              <p>Toute personne morale ou entité publique, dûment représentée, ainsi que toute personne physique, majeure et ayant la capacité juridique, sont autorisées à s'inscrire sur le Site. L'inscription est indispensable pour rendre possible l'accès au Service.</p>
              <p>Lorsque l'inscription est conclue, un identifiant (i.e. adresse email ou nom et prénom) et un mot de passe doivent être choisis par le Client, le Recruteur et/ou le Candidat. L'identifiant et le mot de passe sont totalement confidentiels et personnels et ils ne doivent jamais être communiqués à des tiers.</p>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 m-0">
                    Le Client, le Recruteur et/ou le Candidat garantissent que les informations communiquées au moment de leur inscription sont précises et correspondent à la réalité.
                  </p>
                </div>
              </div>
              <p>Pour des mesures de sécurité et de protection des données, HUNTZEN supprimera les comptes des Clients, Recruteurs et/ou Candidats qui sont inopérants, ou sans crédit ou débit, pendant une période d'une année.</p>
            </div>
          </section>

          <section id="prix" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">Prix et modalités de paiement</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>Tous les prix indiqués par HUNTZEN sur le Site et dans d'autres documents écrits émis par HUNTZEN sont indiqués hors TVA, laquelle sera rajoutée au taux légal au jour de l'émission de la facture correspondante. Toutes les factures sont payables en euros.</p>
              <p>HUNTZEN se réserve le droit de modifier les prix à tout moment sans préavis.</p>

              <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">Conditions financières par profil :</h3>

              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-bold text-gray-900 mb-3">Pour le Client</h4>
                  <ul className="space-y-2 list-none pl-0">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>Les factures doivent être payées selon les conditions prévues dans les contrats signés entre HUNTZEN et le Client</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>Le paiement doit être effectué par virement bancaire</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-bold text-gray-900 mb-3">Pour le Recruteur</h4>
                  <ul className="space-y-2 list-none pl-0">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>Le Recruteur percevra <strong>70%</strong> de ce que le Client aura payé à HUNTZEN pour le recrutement réalisé</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>Le recrutement d'un Candidat dont le CV a été récupéré via le Site HUNTZEN ouvre droit à une prime réduite à <strong>20%</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>Le paiement sera effectué par virement bancaire dès que la période d'essai sera validée</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-bold text-gray-900 mb-3">Pour le Candidat</h4>
                  <ul className="space-y-2 list-none pl-0">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>Lorsqu'un CV est recruté par un Client, HUNTZEN verse au Candidat <strong>50%</strong> de ce que le Client a payé</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>Le paiement sera effectué par virement bancaire dès que la période d'essai sera validée</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section id="responsabilites" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">Obligations et responsabilités</h2>
            </div>
            <div className="space-y-6 text-gray-700">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Obligations d'HUNTZEN</h3>
                <p>HUNTZEN s'engage à mettre en œuvre tous les moyens nécessaires afin d'assurer au mieux la fourniture du Service.</p>
                <p>Afin de préserver la qualité du Site, HUNTZEN se réserve le droit de refuser un Client, une annonce, un Recruteur ou un Candidat à sa seule discrétion.</p>
                <p>En cas de non-respect des CGVU par un Utilisateur, HUNTZEN peut résilier unilatéralement et sans délai l'inscription de tout Client, Recruteur ou Candidat, par simple notification électronique.</p>
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Obligations du Client</h3>
                <ul className="space-y-2 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>Obligation de prévenir HUNTZEN des entretiens avec les Candidats avec un feedback</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>Obligation de prévenir HUNTZEN de tout recrutement effectué</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Obligations du Recruteur</h3>
                <ul className="space-y-2 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>Obligation de prévenir HUNTZEN lorsqu'un Candidat a été recruté</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>Obligation d'envoyer des CV avec un compte rendu correspondant à la recherche du Client</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Obligations du Candidat</h3>
                <ul className="space-y-2 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>Obligation de prévenir HUNTZEN lorsqu'il y a eu un recrutement ou un entretien</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>Obligation d'envoyer un CV qui correspond à la fiche de poste</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Exclusion de la responsabilité</h2>
            <div className="space-y-4 text-gray-700">
              <p>Dans toute la mesure permise par la loi, toute responsabilité de HUNTZEN ou de ses sociétés affiliées est exclue en cas de perte ou de tout autre dommage subi par l'Utilisateur sur la base ou en relation avec la conclusion d'un contrat de prestation et utilisation des services offerts sur le Site HUNTZEN.</p>
              <p>Le Client, Recruteur ou Candidat accepte que l'utilisation des services offerts par HUNTZEN se fait à son propre risque.</p>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 m-0">
                    Les retards, la mauvaise exécution ou la non-exécution totale ou partielle des services en cas de force majeure ne peuvent donner lieu à indemnité.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Loi applicable et compétence</h2>
            <div className="space-y-4 text-gray-700">
              <p>La relation entre HUNTZEN et l'Utilisateur en vertu des présentes CGVU est soumis au droit matériel portugais, à moins que les règles de la loi du pays de résidence de l'Utilisateur soient impératives.</p>
              <p>En cas de difficultés d'interprétation ou d'exécution des CGVU, l'Utilisateur et HUNTZEN s'efforceront de régler leur différend à l'amiable dans un délai de trente (30) jours calendaires.</p>
              <p>Tout contentieux judiciaire ou arbitral découlant de la relation contractuelle entre HUNTZEN et l'Utilisateur dans le cadre des présentes CGVU sera soumis aux tribunaux portugais.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Contact</h2>
            <div className="bg-gray-50 rounded-lg p-6">
              <p className="text-gray-700 mb-4">Le Site est exploité par HUNTZEN, Unipessoal Lda., dont le siège social est situé à Rua dos Lusíadas 5 5b, 1300-365 Lisboa, Portugal.</p>
              <p className="text-gray-700 mb-4">Si vous avez des questions concernant le Site et son contenu, veuillez contacter notre service client :</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                  <span>Téléphone : +351 21 111 9967 ou +33 (1) 84 19 26 61</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                  <span>E-mail : contact@huntzenjobs.co</span>
                </li>
              </ul>
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
                <li><Link href="/privacy" className="hover:text-[#00D9FF] transition-colors">Politique de confidentialité</Link></li>
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

        .prose h4 {
          margin-top: 1rem;
          margin-bottom: 0.5rem;
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
