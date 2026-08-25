import { createSerwistRoute } from "@serwist/turbopack";

export const {
  dynamic,
  dynamicParams,
  revalidate,
  generateStaticParams,
  GET,
} = createSerwistRoute({
  globPatterns: [
    "public/manifest.json",
    "public/icons/**/*.{png,svg,ico}",
    "public/logo*.{png,svg}",
  ],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
