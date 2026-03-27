import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReferralProgressBar } from "@/components/referral/referral-progress-bar";
import { ReferralTierCard } from "@/components/referral/referral-tier-card";
import { ReferralFriendsList } from "@/components/referral/referral-friends-list";

const mockTiers = [
  { friends: 1, reward_type: "quota_bonus", label: "+10 recherches" },
  {
    friends: 3,
    reward_type: "free_days",
    days: 2,
    plan: "starter",
    label: "48h Starter offerts",
  },
  {
    friends: 5,
    reward_type: "free_days",
    days: 7,
    plan: "pro",
    label: "7 jours Pro offerts",
  },
  {
    friends: 10,
    reward_type: "stripe_coupon",
    discount_percent: 50,
    plan: "pro",
    label: "-50% Pro",
  },
];

describe("ReferralProgressBar", () => {
  it("affiche les jalons des paliers", () => {
    render(
      <ReferralProgressBar
        totalValidated={3}
        currentTier={1}
        nextTier={2}
        friendsToNext={2}
        tiers={mockTiers}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
  it("affiche encore X amis pour le prochain palier", () => {
    render(
      <ReferralProgressBar
        totalValidated={3}
        currentTier={1}
        nextTier={2}
        friendsToNext={2}
        tiers={mockTiers}
      />,
    );
    expect(screen.getByText("remaining")).toBeInTheDocument();
  });
});

describe("ReferralTierCard", () => {
  it("affiche le label du palier", () => {
    render(
      <ReferralTierCard
        tier={mockTiers[0]}
        index={0}
        isUnlocked={true}
        isCurrent={false}
      />,
    );
    expect(screen.getByText("+10 recherches")).toBeInTheDocument();
  });
  it("affiche 'Atteint' si débloqué", () => {
    render(
      <ReferralTierCard
        tier={mockTiers[0]}
        index={0}
        isUnlocked={true}
        isCurrent={false}
      />,
    );
    expect(screen.getByText("reached")).toBeInTheDocument();
  });
  it("affiche 'Verrouillé' si non débloqué", () => {
    render(
      <ReferralTierCard
        tier={mockTiers[3]}
        index={3}
        isUnlocked={false}
        isCurrent={false}
      />,
    );
    expect(screen.getByText("locked")).toBeInTheDocument();
  });
});

describe("ReferralFriendsList", () => {
  it("affiche les statuts validé et inscrit", () => {
    render(
      <ReferralFriendsList
        friends={[
          { status: "validated", signed_up_at: "2026-03-11T10:00:00Z" },
          { status: "registered", signed_up_at: "2026-03-10T10:00:00Z" },
        ]}
      />,
    );
    expect(
      screen.getAllByText(/validated|badgeValidated/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/registered|badgeRegistered/i).length,
    ).toBeGreaterThan(0);
  });
  it("affiche message vide si aucun ami", () => {
    render(<ReferralFriendsList friends={[]} />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });
});
