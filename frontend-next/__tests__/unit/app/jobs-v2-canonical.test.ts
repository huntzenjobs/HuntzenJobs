import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("route Jobs canonique", () => {
  it("rend uniquement le formulaire V2 sans branche de feature flag", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/jobs/page.tsx"),
      "utf8",
    );
    const featureFlags = readFileSync(
      join(process.cwd(), "src/lib/feature-flags.ts"),
      "utf8",
    );

    expect(source).toContain("<SearchFormInline");
    expect(source).not.toContain("featureFlags.useJobsV2");
    expect(featureFlags).not.toContain("useJobsV2");
    expect(featureFlags).not.toContain("jobsV2");
    expect(featureFlags).not.toContain("NEXT_PUBLIC_FF_JOBS_V2");
  });
});
