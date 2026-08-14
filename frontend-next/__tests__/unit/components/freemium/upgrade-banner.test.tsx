import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpgradeBanner } from "@/components/freemium/upgrade-banner";

const openPricingModal = vi.fn();

vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({
    isFreePlan: true,
    openPricingModal,
  }),
}));

describe("UpgradeBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    openPricingModal.mockClear();
  });

  it("nomme la fermeture et ouvre les plans depuis le CTA minimal", async () => {
    render(<UpgradeBanner variant="minimal" />);

    const cta = await screen.findByRole("button", { name: "minimal.cta" });
    fireEvent.click(cta);

    expect(openPricingModal).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "dismiss" })).toHaveClass(
      "size-11",
    );
    await waitFor(() => expect(cta).toBeEnabled());
  });
});
