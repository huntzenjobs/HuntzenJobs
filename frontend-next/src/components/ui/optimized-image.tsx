"use client";

import Image, { ImageProps } from "next/image";
import { useState } from "react";

/**
 * Composant Image optimisé pour Core Web Vitals
 * - Prévient CLS avec placeholder blur
 * - Lazy loading par défaut
 * - Dimensions explicites requises
 */
interface OptimizedImageProps extends Omit<ImageProps, "placeholder"> {
  /** URL de l'image blur pour placeholder (optionnel) */
  blurDataURL?: string;
  /** Classes CSS pour le conteneur wrapper */
  wrapperClassName?: string;
}

export function OptimizedImage({
  alt,
  className,
  wrapperClassName,
  blurDataURL,
  ...props
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={`relative ${wrapperClassName || ""}`}>
      <Image
        {...props}
        alt={alt}
        className={`transition-opacity duration-300 ${
          isLoaded ? "opacity-100" : "opacity-0"
        } ${className || ""}`}
        placeholder={blurDataURL ? "blur" : "empty"}
        blurDataURL={blurDataURL}
        onLoad={() => setIsLoaded(true)}
        // Priorité pour images above-the-fold
        priority={props.priority || false}
        // Lazy loading par défaut pour images below-the-fold
        loading={props.priority ? undefined : "lazy"}
        // Sizes pour responsive (requis pour optimisation)
        sizes={
          props.sizes ||
          "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        }
      />
    </div>
  );
}
