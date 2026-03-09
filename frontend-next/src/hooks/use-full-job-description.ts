import { useState, useEffect } from "react";
import { huntzenApi } from "@/lib/api/huntzen-client";

export function useFullJobDescription(
  url: string | undefined,
  source?: string,
) {
  const [description, setDescription] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFinalUrl(null);
    setDescription(null);

    if (!url) return;

    const fetchFullDescription = async () => {
      setLoading(true);
      try {
        const result = await huntzenApi.getJobDescription(url, source);
        if (result && result.description && result.description.length > 100) {
          setDescription(result.description);
        }
        if (result.final_url && result.final_url !== url) {
          setFinalUrl(result.final_url);
        }
      } catch (err) {
        console.error("Failed to fetch full description:", err);
        setError("Impossible de charger la description complète");
      } finally {
        setLoading(false);
      }
    };

    fetchFullDescription();
  }, [url, source]);

  return { description, finalUrl, loading, error };
}
