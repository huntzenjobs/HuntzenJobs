import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  UsageCounter,
  UsageSummary,
} from "@/components/freemium/usage-counter";

// Mock the subscription context
const mockSubscriptionContext = {
  getRemaining: vi.fn(),
  limits: {
    job_searches_per_day: 3,
    jobs_visible: 5,
    ats_scores_per_day: 1,
    matching_scores_per_day: 3,
    assistant_messages_per_day: 10,
    saved_jobs_per_day: 5,
    recruiter_searches_per_day: 1,
    cv_adapt_per_day: 5,
    cover_letter_per_day: 10,
  },
  isFreePlan: true,
  plan: "free",
  isLoaded: true,
  assistantMessagesRemaining: 10,
  assistantMessagesLimit: 10,
  hasFeature: vi.fn((_feature?: string) => true),
};

vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => mockSubscriptionContext,
}));

describe("UsageCounter Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionContext.getRemaining.mockReturnValue(2);
    mockSubscriptionContext.isFreePlan = true;
    mockSubscriptionContext.limits.job_searches_per_day = 3;
  });

  describe("Rendering", () => {
    it("renders job_search feature counter", () => {
      render(<UsageCounter feature="job_search" />);
      // Should display remaining searches
      expect(
        screen.getByText(/features\.jobSearch\.label/i),
      ).toBeInTheDocument();
    });

    it("renders ATS score feature counter", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(1);
      render(<UsageCounter feature="ats_score" />);
      // Use getAllByText since "analyses" appears multiple times
      const elements = screen.getAllByText(/features\.atsScore\.label/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it("renders assistant_messages feature counter", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(300);
      render(<UsageCounter feature="assistant_messages" />);
      // Should display messages remaining
      expect(
        screen.getByText(/features\.assistantMessages\.label/i),
      ).toBeInTheDocument();
    });
  });

  describe("Icon display", () => {
    it("shows icon by default", () => {
      render(<UsageCounter feature="job_search" showIcon={true} />);
      // Icon should be present (SVG element)
      const container = screen
        .getByText(/features\.jobSearch\.label/i)
        .closest("div");
      expect(container?.querySelector("svg")).toBeInTheDocument();
    });

    it("hides icon when showIcon is false", () => {
      render(<UsageCounter feature="job_search" showIcon={false} />);
      const container = screen
        .getByText(/features\.jobSearch\.label/i)
        .closest("span");
      expect(container?.querySelector("svg")).toBeNull();
    });
  });

  describe("Progress bar", () => {
    it("shows progress bar by default", () => {
      render(<UsageCounter feature="job_search" showBar={true} />);
      // Progress bar should be visible
      const container = document.querySelector(".bg-gray-100");
      expect(container).toBeInTheDocument();
    });

    it("utilise les limites du plan quand les quotas CV ne sont pas encore chargés", () => {
      mockSubscriptionContext.getRemaining.mockImplementation((feature) =>
        feature === "cv_adapt" ? 5 : 10,
      );

      render(
        <>
          <UsageCounter feature="cv_adapt" />
          <UsageCounter feature="cover_letter" />
        </>,
      );

      expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute(
        "aria-valuemax",
        "5",
      );
      expect(screen.getAllByRole("progressbar")[1]).toHaveAttribute(
        "aria-valuemax",
        "10",
      );
    });
  });

  describe("Compact mode", () => {
    it("renders in compact mode", () => {
      render(<UsageCounter feature="job_search" compact={true} />);
      // Compact mode uses inline-flex and rounded-full
      const element = screen.getByText("2").closest("span");
      expect(element).toHaveClass("inline-flex");
    });
  });

  describe("Color coding", () => {
    it("shows counter when remaining is more than half", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(2); // 2/3 = 66%
      render(<UsageCounter feature="job_search" />);
      const text = screen.getByText(/features\.jobSearch\.label/i);
      expect(text).toBeInTheDocument();
    });

    it("shows counter when remaining is between 25-50%", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(1); // 1/3 = 33%
      render(<UsageCounter feature="job_search" />);
      expect(
        screen.getByText(/features\.jobSearch\.label/i),
      ).toBeInTheDocument();
    });

    it("shows counter when remaining is less than 25%", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(0); // 0/3 = 0%
      render(<UsageCounter feature="job_search" />);
      expect(
        screen.getByText(/features\.jobSearch\.label/i),
      ).toBeInTheDocument();
    });
  });

  describe("Contraste", () => {
    it("utilise un texte sombre par défaut sur les surfaces claires", () => {
      render(<UsageCounter feature="ats_score" />);

      expect(
        screen.getByText(/features\.atsScore\.label/i).parentElement,
      ).toHaveClass("text-slate-700");
    });

    it("conserve un texte clair dans le résumé de la sidebar", () => {
      render(<UsageSummary appearance="dark" />);

      expect(
        screen.getByText(/features\.jobSearch\.label/i).parentElement,
      ).toHaveClass("text-white/90");
    });
  });

  describe("Unlimited features", () => {
    it("returns null for unlimited features on paid plans", () => {
      mockSubscriptionContext.isFreePlan = false;
      mockSubscriptionContext.limits.job_searches_per_day = Infinity;
      mockSubscriptionContext.getRemaining.mockReturnValue(Infinity);

      const { container } = render(<UsageCounter feature="job_search" />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Custom className", () => {
    it("accepts custom className", () => {
      render(<UsageCounter feature="job_search" className="custom-class" />);
      const container = screen
        .getByText(/features\.jobSearch\.label/i)
        .closest("div");
      expect(container?.parentElement).toHaveClass("custom-class");
    });
  });
});

describe("UsageSummary Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionContext.isFreePlan = true;
    mockSubscriptionContext.plan = "free";
    mockSubscriptionContext.isLoaded = true;
    mockSubscriptionContext.getRemaining.mockReturnValue(2);
    mockSubscriptionContext.limits.job_searches_per_day = 3;
    mockSubscriptionContext.limits.ats_scores_per_day = 1;
    mockSubscriptionContext.limits.assistant_messages_per_day = 10;
    mockSubscriptionContext.assistantMessagesRemaining = 8;
    mockSubscriptionContext.assistantMessagesLimit = 10;
    mockSubscriptionContext.hasFeature.mockReturnValue(true);
  });

  describe("Rendering", () => {
    it("renders summary for free plan", () => {
      render(<UsageSummary />);
      expect(screen.getByText("dailyUsage")).toBeInTheDocument();
    });

    it("does not render for paid plan", () => {
      mockSubscriptionContext.isFreePlan = false;
      mockSubscriptionContext.plan = "pro";
      const { container } = render(<UsageSummary />);
      expect(container.firstChild).toBeNull();
    });

    it("does not render misleading quotas while subscription data loads", () => {
      mockSubscriptionContext.isLoaded = false;
      const { container } = render(<UsageSummary />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Features displayed", () => {
    it("displays job search counter", () => {
      render(<UsageSummary />);
      expect(
        screen.getByText(/features\.jobSearch\.label/i),
      ).toBeInTheDocument();
    });

    it("displays ATS score counter", () => {
      render(<UsageSummary />);
      // Use getAllByText since "analyses" appears multiple times
      const elements = screen.getAllByText(/features\.atsScore\.label/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it("displays assistant messages counter", () => {
      render(<UsageSummary />);
      // Should display messages label
      expect(
        screen.getByText(/features\.assistantMessages\.label/i),
      ).toBeInTheDocument();
    });

    it("hides the saved jobs quota when favorites are unavailable", () => {
      mockSubscriptionContext.hasFeature.mockImplementation(
        (feature?: string) => feature !== "has_favorites",
      );

      render(<UsageSummary />);

      expect(
        screen.queryByText(/features\.savedJobs\.label/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("generalUsage")).not.toBeInTheDocument();
    });
  });

  describe("Custom className", () => {
    it("accepts custom className", () => {
      render(<UsageSummary className="custom-summary" />);
      const container = screen.getByText("dailyUsage").closest("div");
      expect(container).toHaveClass("custom-summary");
    });
  });
});
