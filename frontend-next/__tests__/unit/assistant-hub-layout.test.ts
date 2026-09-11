import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const assistantPage = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/assistant/page.tsx"),
  "utf8",
);

describe("Assistant hub card layout", () => {
  it("keeps the cards at a uniform height from tablet layouts", () => {
    expect(assistantPage).toContain(
      "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 sm:auto-rows-fr gap-4",
    );
    expect(assistantPage).toMatch(
      /<motion\.div[\s\S]*?className="h-full"[\s\S]*?<button/,
    );
    expect(assistantPage).toContain(
      "w-full h-full flex flex-col text-left p-5 rounded-2xl",
    );
  });

  it("anchors the response time to the bottom of each card", () => {
    expect(assistantPage).toContain(
      "mt-auto flex items-center gap-1.5 text-xs text-slate-400",
    );
  });
});
