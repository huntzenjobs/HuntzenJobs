/**
 * Utility to format job source names for user display
 * Masks internal API sources with user-friendly names
 */

const SOURCE_MAPPING: Record<string, string> = {
  adzuna: "Adzuna",
  google_jobs: "Google Jobs",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  monster: "Monster",
  apec: "APEC",
  pole_emploi: "France Travail",
  france_travail: "France Travail",
  welcometothejungle: "Welcome to the Jungle",
  glassdoor: "Glassdoor",
  jsearch: "JSearch",
  remoteok: "Remote OK",
  careerjet: "Careerjet",
  jooble: "Jooble",
  le_forem: "Le Forem",
  ziprecruiter: "ZipRecruiter",
};

/**
 * Format job source for display
 * Converts internal API source names to user-friendly labels
 */
export function formatJobSource(source: string): string {
  if (!source) return "Source non spécifiée";

  // Check if we have a mapping for this source
  const lowerSource = source.toLowerCase().replace(/[_\s-]/g, "");

  for (const [key, value] of Object.entries(SOURCE_MAPPING)) {
    const lowerKey = key.toLowerCase().replace(/[_\s-]/g, "");
    if (lowerSource.includes(lowerKey) || lowerKey.includes(lowerSource)) {
      return value;
    }
  }

  // If no mapping found, return generic label
  return source;
}

/**
 * Get a consistent icon color for a job source
 */
export function getSourceColor(source: string): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-indigo-500",
  ];

  // Use source hash to get consistent color
  const hash = source
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
