import { describe, expect, it, vi } from "vitest";

import { saveConfirmedApplication } from "@/components/jobs/apply-modal";
import type { Job } from "@/lib/api/huntzen-client";

const job = {
  id: "job-123",
  title: "Développeur Python",
  company: "HuntZen Test",
  location: "Paris",
  salary: "50 k€",
  url: "https://example.test/jobs/123",
  source: "test",
} as Job;

describe("saveConfirmedApplication", () => {
  it("persiste la candidature avant de permettre le succès UI", async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));

    await saveConfirmedApplication(authenticatedFetch, job);

    expect(authenticatedFetch).toHaveBeenCalledOnce();
    const [, options] = authenticatedFetch.mock.calls[0];
    expect(JSON.parse(options.body as string)).toMatchObject({
      external_job_id: "job-123",
      confirmed_by_user: true,
    });
  });

  it("rejette un faux succès lorsque l'API échoue", async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));

    await expect(saveConfirmedApplication(authenticatedFetch, job)).rejects.toThrow(
      "Application save failed (500)",
    );
  });
});
