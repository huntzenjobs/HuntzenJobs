/**
 * CVInfoPanel - Display extracted CV information
 * Features: name, email, phone, skills with copy-to-clipboard
 */

"use client";

import { useState } from "react";
import { User, Mail, Phone, Briefcase, Copy, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface CVInfo {
  // Legacy fields
  name?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  // New fields from backend
  nom_complet?: string;
  poste_actuel?: string;
  annees_experience?: number;
  telephone?: string;
  age?: number | null;
  competences_principales?: string[];
  localisation?: string;
}

interface CVInfoPanelProps {
  cvInfo: CVInfo;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CVInfoPanel({ cvInfo, className }: CVInfoPanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Normalize field names (backend sends nom_complet, frontend expects name)
  const displayName = cvInfo.nom_complet || cvInfo.name;
  const displayEmail = cvInfo.email;
  const displayPhone = cvInfo.telephone || cvInfo.phone;
  const displaySkills = cvInfo.competences_principales || cvInfo.skills;

  // Don't render if no info
  if (
    !displayName &&
    !displayEmail &&
    !displayPhone &&
    !cvInfo.poste_actuel &&
    !cvInfo.annees_experience &&
    (!displaySkills || displaySkills.length === 0)
  ) {
    return null;
  }

  return (
    <Card
      className={cn(
        "bg-gradient-to-br from-blue-50 to-violet-50 border-blue-200",
        className,
      )}
    >
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-gray-900">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-huntzen-blue to-huntzen-turquoise flex items-center justify-center">
            <User className="h-5 w-5 text-white" />
          </div>
          Informations extraites
        </CardTitle>
        <CardDescription className="text-gray-700">
          Données identifiées dans votre CV
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {/* Name */}
        {displayName && (
          <div className="flex items-center justify-between p-3 bg-white rounded-lg col-span-2">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">👤 Nom complet</p>
                <p className="text-sm font-bold text-gray-900">{displayName}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(displayName, "name")}
              className="h-8 w-8 p-0"
            >
              {copiedField === "name" ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 text-gray-500" />
              )}
            </Button>
          </div>
        )}

        {/* Poste actuel */}
        {cvInfo.poste_actuel && (
          <div className="flex items-center justify-between p-3 bg-white rounded-lg col-span-2">
            <div className="flex items-center gap-3">
              <Briefcase className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">💼 Poste actuel</p>
                <p className="text-sm font-bold text-gray-900">
                  {cvInfo.poste_actuel}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Années d'expérience */}
        {cvInfo.annees_experience !== undefined &&
          cvInfo.annees_experience !== null && (
            <div className="flex items-center justify-between p-3 bg-white rounded-lg">
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">⏱️ Expérience</p>
                  <p className="text-sm font-bold text-gray-900">
                    {cvInfo.annees_experience} ans
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Localisation */}
        {cvInfo.localisation && (
          <div className="flex items-center justify-between p-3 bg-white rounded-lg">
            <div className="flex items-center gap-3">
              <Briefcase className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">📍 Localisation</p>
                <p className="text-sm font-semibold text-gray-900">
                  {cvInfo.localisation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Email */}
        {displayEmail && (
          <div className="flex items-center justify-between p-3 bg-white rounded-lg col-span-2">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">📧 Email</p>
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {displayEmail}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(displayEmail, "email")}
              className="h-8 w-8 p-0"
            >
              {copiedField === "email" ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 text-gray-500" />
              )}
            </Button>
          </div>
        )}

        {/* Phone */}
        {displayPhone && (
          <div className="flex items-center justify-between p-3 bg-white rounded-lg col-span-2">
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">📱 Téléphone</p>
                <p className="text-sm font-semibold text-gray-900">
                  {displayPhone}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(displayPhone, "phone")}
              className="h-8 w-8 p-0"
            >
              {copiedField === "phone" ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 text-gray-500" />
              )}
            </Button>
          </div>
        )}

        {/* Skills */}
        {displaySkills && displaySkills.length > 0 && (
          <div className="p-3 bg-white rounded-lg col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="h-4 w-4 text-gray-500" />
              <p className="text-xs text-gray-500 font-medium">
                🎯 Compétences principales
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {displaySkills.slice(0, 5).map((skill, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
