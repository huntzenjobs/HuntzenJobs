import { afterEach, describe, expect, it, vi } from "vitest";

import { HuntzenApiClient } from "@/lib/api/huntzen-client";

describe("HuntzenApiClient city search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ne contacte pas l'API avec un code pays incomplet", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const api = new HuntzenApiClient("https://api.test");

    await expect(api.searchCities("Paris", "f")).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mutualise deux recherches identiques lancées en même temps", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ name: "Paris", type: "city" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HuntzenApiClient("https://api.test");

    const [first, second] = await Promise.all([
      api.searchCities("Par", "fr"),
      api.searchCities("Par", "fr"),
    ]);

    expect(first).toEqual([{ name: "Paris", type: "city" }]);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("met en cache la liste statique des pays", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ name: "France", code: "fr" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HuntzenApiClient("https://api.test");

    const [first, second] = await Promise.all([
      api.getCountries(),
      api.getCountries(),
    ]);

    expect(first).toEqual([{ name: "France", code: "fr" }]);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
