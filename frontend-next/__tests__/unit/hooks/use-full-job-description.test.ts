import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useFullJobDescription } from "@/hooks/use-full-job-description";

const { getJobDescription } = vi.hoisted(() => ({ getJobDescription: vi.fn() }));
vi.mock("@/lib/api/huntzen-client", () => ({ huntzenApi: { getJobDescription } }));

beforeEach(() => { getJobDescription.mockReset(); });

it("ne remplace pas le lien de l'offre courante par une réponse ancienne", async () => {
  let finishFirst!: (value: { description: string; final_url: string }) => void;
  getJobDescription.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
  getJobDescription.mockResolvedValueOnce({ description: "B".repeat(120), final_url: "https://example.com/b" });
  const { result, rerender } = renderHook(({ url }) => useFullJobDescription(url), {
    initialProps: { url: "https://example.com/source-a" },
  });
  await act(async () => rerender({ url: "https://example.com/source-b" }));
  expect(result.current.finalUrl).toBe("https://example.com/b");
  await act(async () => finishFirst({ description: "A".repeat(120), final_url: "https://example.com/a" }));
  expect(result.current.finalUrl).toBe("https://example.com/b");
  expect(result.current.description).toBe("B".repeat(120));
});

it("arrête l'état de chargement quand l'offre est retirée", async () => {
  getJobDescription.mockImplementation(() => new Promise(() => {}));
  const { result, rerender } = renderHook(({ url }: { url: string | undefined }) => useFullJobDescription(url), {
    initialProps: { url: "https://example.com/a" as string | undefined },
  });
  expect(result.current.loading).toBe(true);
  await act(async () => rerender({ url: undefined }));
  expect(result.current.loading).toBe(false);
});
