import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CareerScoreCard } from "@/components/career-score/career-score-card";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok" } }),
}));
vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ hasFeature: () => true }),
}));
vi.mock("@/hooks/use-career-score", () => ({
  useCareerScore: () => ({
    score: {
      total_score: 68,
      activity_score: 30,
      ai_score: 28,
      xp_score: 10,
      ai_justification: "Profil solide.",
    },
    isLoading: false,
    error: null,
    recalculate: vi.fn(),
  }),
}));

describe("CareerScoreCard", () => {
  it("affiche le score total", () => {
    render(<CareerScoreCard />);
    expect(screen.getByText("68")).toBeInTheDocument();
  });

  it("affiche les 3 sous-barres Activity, AI, XP", () => {
    render(<CareerScoreCard />);
    expect(screen.getByText(/activité/i)).toBeInTheDocument();
    expect(screen.getByText(/ia/i)).toBeInTheDocument();
    expect(screen.getByText(/xp/i)).toBeInTheDocument();
  });

  it("affiche la justification IA", () => {
    render(<CareerScoreCard />);
    expect(screen.getByText("Profil solide.")).toBeInTheDocument();
  });

  it("affiche le message motivant si score > 60", () => {
    render(<CareerScoreCard />);
    expect(
      screen.getByText(/profil devient vraiment intéressant/i)
    ).toBeInTheDocument();
  });
});
