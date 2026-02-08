'use client'

import { motion } from 'framer-motion'
import { Sparkles, Calendar, MapPin, Building } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { JobFair } from '@/lib/api/huntzen-client'

interface Props {
  events: JobFair[]
}

export function FeaturedEventsCarousel({ events }: Props) {
  // Sélectionner 4 événements phares (critères: pas gratuit, nombreuses entreprises)
  const featured = events
    .filter(e => !e.is_free && e.companies_count && e.companies_count > 50)
    .slice(0, 4)

  if (featured.length === 0) return null

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-huntzen-blue" />
          Événements phares
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {featured.map((event, idx) => (
          <motion.div
            key={event.url}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="h-full flex flex-col overflow-hidden border-2 border-huntzen-blue/30 hover:border-huntzen-blue hover:shadow-xl transition-all">
              {/* Header gradient */}
              <div className="h-32 bg-gradient-to-br from-huntzen-blue to-blue-600 flex items-center justify-center p-4">
                <h3 className="text-white font-bold text-center text-lg line-clamp-2">
                  {event.title}
                </h3>
              </div>

              {/* Content */}
              <div className="flex-1 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-huntzen-blue" />
                  <span className="font-medium">
                    {new Date(event.date_start).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long'
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-huntzen-blue" />
                  <span className="font-medium">{event.city}</span>
                </div>

                {event.companies_count && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building className="w-4 h-4 text-huntzen-blue" />
                    <span className="font-medium">{event.companies_count} entreprises</span>
                  </div>
                )}

                <Badge className="bg-huntzen-blue text-white">
                  {event.event_type}
                </Badge>
              </div>

              {/* CTA */}
              <div className="p-4 pt-0">
                <Button
                  className="w-full bg-gradient-to-r from-huntzen-blue to-blue-700 hover:from-blue-700 hover:to-blue-800"
                  asChild
                >
                  <a href={event.url} target="_blank" rel="noopener noreferrer">
                    Voir les détails
                  </a>
                </Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
