import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CUSTOM_SUPABASE_ORIGIN = "https://auth.huntzenjobs.com";
const LEGACY_SUPABASE_ORIGIN = "https://ngiakfikbuyugqfqtfwp.supabase.co";

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("bascule du domaine Supabase", () => {
  it("autorise le domaine personnalisé dans la CSP tout en conservant le rollback legacy", () => {
    const nextConfig = readProjectFile("next.config.js");

    expect(nextConfig).toContain(CUSTOM_SUPABASE_ORIGIN);
    expect(nextConfig).toContain("wss://auth.huntzenjobs.com");
    expect(nextConfig).toContain(LEGACY_SUPABASE_ORIGIN);
  });

  it("autorise les images servies par le domaine Supabase personnalisé", () => {
    const nextConfig = readProjectFile("next.config.js");

    expect(nextConfig).toContain("hostname: 'auth.huntzenjobs.com'");
  });

  it("préconnecte le layout et les resource hints au nouveau domaine", () => {
    const layout = readProjectFile("src/app/layout.tsx");
    const resourceHints = readProjectFile(
      "src/lib/performance/resource-hints.ts",
    );

    expect(layout).toContain(CUSTOM_SUPABASE_ORIGIN);
    expect(resourceHints).toContain(CUSTOM_SUPABASE_ORIGIN);
  });
});
