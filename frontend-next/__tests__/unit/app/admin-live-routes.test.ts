import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("routes de contrôle admin live", () => {
  it("appelle les endpoints backend montés sous /api", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/admin/live/page.tsx"),
      "utf8",
    );

    expect(source).toContain('adminFetch("/api/admin/maintenance")');
    expect(source).toContain('"/api/admin/maintenance/disable"');
    expect(source).toContain('"/api/admin/maintenance/enable"');
    expect(source).toContain('adminFetch("/api/admin/banner"');
  });
});
