import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import nextConfig, {
  resolveOutputMode,
} from "../../../next.config.mjs";

const CUSTOM_SUPABASE_ORIGIN = "https://auth.huntzenjobs.com";
const LEGACY_SUPABASE_ORIGIN = "https://ngiakfikbuyugqfqtfwp.supabase.co";
const STAGING_BACKEND_ORIGIN = "https://api-staging.huntzenjobs.com";

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("bascule du domaine Supabase", () => {
  it("laisse Vercel produire ses fonctions tout en gardant le standalone Docker", () => {
    expect(resolveOutputMode("1")).toBeUndefined();
    expect(resolveOutputMode(undefined)).toBe("standalone");
  });

  it("autorise le domaine personnalisé dans la CSP tout en conservant le rollback legacy", async () => {
    const headerRules = await nextConfig.headers?.();
    const csp = headerRules?.[0]?.headers.find(
      ({ key }) => key === "Content-Security-Policy",
    )?.value;

    expect(csp).toContain(CUSTOM_SUPABASE_ORIGIN);
    expect(csp).toContain("wss://auth.huntzenjobs.com");
    expect(csp).toContain(LEGACY_SUPABASE_ORIGIN);
  });

  it("autorise le backend staging dans la directive connect-src", async () => {
    const headerRules = await nextConfig.headers?.();
    const csp = headerRules?.[0]?.headers.find(
      ({ key }) => key === "Content-Security-Policy",
    )?.value;

    expect(csp).toContain(STAGING_BACKEND_ORIGIN);
  });

  it("autorise les images servies par le domaine Supabase personnalisé", () => {
    expect(nextConfig.images?.remotePatterns).toContainEqual({
      hostname: "auth.huntzenjobs.com",
      protocol: "https",
    });
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
