import { describe, expect, it } from "vitest";

import { normalizeAdaptMatchScore } from "@/components/cv/cv-upload-async-wizard";

describe("normalizeAdaptMatchScore", () => {
  it.each([
    [{ overall: 78 }, 78],
    [0.78, 78],
    [78, 78],
  ])("normalise le score backend %j en %d%%", (score, expected) => {
    expect(normalizeAdaptMatchScore(score)).toBe(expected);
  });

  it.each([null, undefined, {}, Number.NaN])(
    "refuse un score inexploitable %j",
    (score) => {
      expect(normalizeAdaptMatchScore(score)).toBeNull();
    },
  );
});
