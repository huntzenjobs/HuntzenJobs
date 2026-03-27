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
    cv_analyses_per_day: 1,
    assistant_messages_per_day: 10,
  },
  isFreePlan: true,
  plan: "free",
  assistantMessagesRemaining: 10,
  assistantMessagesLimit: 10,
  hasFeature: vi.fn(() => true),
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

    it("renders cv_analysis feature counter", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(1);
      render(<UsageCounter feature="cv_analysis" />);
      // Use getAllByText since "analyses" appears multiple times
      const elements = screen.getAllByText(/features\.cvAnalysis\.label/i);
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
  });

  describe("Compact mode", () => {
    it("renders in compact mode", () => {
      render(<UsageCounter feature="job_search" compact={true} />);
      // Compact mode uses inline-flex and rounded-full
      const element = screen.getByText(/1\/3|2\/3/).closest("span");
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
    mockSubscriptionContext.getRemaining.mockReturnValue(2);
    mockSubscriptionContext.limits.job_searches_per_day = 3;
    mockSubscriptionContext.limits.cv_analyses_per_day = 1;
    mockSubscriptionContext.limits.assistant_messages_per_day = 10;
    mockSubscriptionContext.assistantMessagesRemaining = 8;
    mockSubscriptionContext.assistantMessagesLimit = 10;
  });

  describe("Rendering", () => {
    it("renders summary for free plan", () => {
      render(<UsageSummary />);
      expect(screen.getByText("dailyUsage")).toBeInTheDocument();
    });

    it("does not render for paid plan", () => {
      mockSubscriptionContext.isFreePlan = false;
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

    it("displays cv analysis counter", () => {
      render(<UsageSummary />);
      // Use getAllByText since "analyses" appears multiple times
      const elements = screen.getAllByText(/features\.cvAnalysis\.label/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it("displays assistant messages counter", () => {
      render(<UsageSummary />);
      // Should display messages label
      expect(
        screen.getByText(/features\.assistantMessages\.label/i),
      ).toBeInTheDocument();
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
