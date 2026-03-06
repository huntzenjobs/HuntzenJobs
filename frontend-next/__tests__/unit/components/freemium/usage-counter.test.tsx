import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  UsageCounter,
  CoachTimer,
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
      expect(screen.getByText(/recherches/i)).toBeInTheDocument();
    });

    it("renders cv_analysis feature counter", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(1);
      render(<UsageCounter feature="cv_analysis" />);
      // Use getAllByText since "analyses" appears multiple times
      const elements = screen.getAllByText(/analyses/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it("renders assistant_messages feature counter", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(300);
      render(<UsageCounter feature="assistant_messages" />);
      // Should display messages remaining
      expect(screen.getByText(/messages|300/i)).toBeInTheDocument();
    });
  });

  describe("Icon display", () => {
    it("shows icon by default", () => {
      render(<UsageCounter feature="job_search" showIcon={true} />);
      // Icon should be present (SVG element)
      const container = screen.getByText(/recherches/i).closest("div");
      expect(container?.querySelector("svg")).toBeInTheDocument();
    });

    it("hides icon when showIcon is false", () => {
      render(<UsageCounter feature="job_search" showIcon={false} />);
      const container = screen.getByText(/recherches/i).closest("span");
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
      const text = screen.getByText(/recherches/i);
      expect(text).toBeInTheDocument();
    });

    it("shows counter when remaining is between 25-50%", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(1); // 1/3 = 33%
      render(<UsageCounter feature="job_search" />);
      expect(screen.getByText(/recherches/i)).toBeInTheDocument();
    });

    it("shows counter when remaining is less than 25%", () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(0); // 0/3 = 0%
      render(<UsageCounter feature="job_search" />);
      expect(screen.getByText(/recherches/i)).toBeInTheDocument();
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
      const container = screen.getByText(/recherches/i).closest("div");
      expect(container?.parentElement).toHaveClass("custom-class");
    });
  });
});

describe("CoachTimer Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionContext.assistantMessagesRemaining = 10;
    mockSubscriptionContext.assistantMessagesLimit = 10;
  });

  describe("Rendering", () => {
    it("renders message counter display", () => {
      render(<CoachTimer />);
      expect(screen.getByText(/10 msg/)).toBeInTheDocument();
    });

    it("renders with different remaining values", () => {
      mockSubscriptionContext.assistantMessagesRemaining = 5;
      render(<CoachTimer />);
      expect(screen.getByText(/5 msg/)).toBeInTheDocument();
    });
  });

  describe("Sizes", () => {
    it("renders in small size", () => {
      render(<CoachTimer size="sm" />);
      expect(screen.getByText(/10 msg/)).toHaveClass("font-mono");
    });

    it("renders in medium size", () => {
      render(<CoachTimer size="md" />);
      expect(screen.getByText(/10 msg/)).toHaveClass("font-medium");
    });

    it("renders in large size", () => {
      render(<CoachTimer size="lg" />);
      expect(screen.getByText(/10 msg/)).toBeInTheDocument();
    });
  });

  describe("Color based on messages remaining", () => {
    it("shows green when more than 50% messages remaining", () => {
      mockSubscriptionContext.assistantMessagesRemaining = 8; // 8/10 = 80%
      mockSubscriptionContext.assistantMessagesLimit = 10;
      render(<CoachTimer />);
      const display = screen.getByText(/8 msg/);
      expect(display).toHaveClass("text-green-600");
    });

    it("shows orange when 20-50% messages remaining", () => {
      mockSubscriptionContext.assistantMessagesRemaining = 3; // 3/10 = 30%
      mockSubscriptionContext.assistantMessagesLimit = 10;
      render(<CoachTimer />);
      const display = screen.getByText(/3 msg/);
      expect(display).toHaveClass("text-orange-600");
    });

    it("shows red when less than 20% messages remaining", () => {
      mockSubscriptionContext.assistantMessagesRemaining = 1; // 1/10 = 10%
      mockSubscriptionContext.assistantMessagesLimit = 10;
      render(<CoachTimer />);
      const display = screen.getByText(/1 msg/);
      expect(display).toHaveClass("text-red-600");
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
      expect(screen.getByText("Utilisation du jour")).toBeInTheDocument();
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
      expect(screen.getByText(/recherches/i)).toBeInTheDocument();
    });

    it("displays cv analysis counter", () => {
      render(<UsageSummary />);
      // Use getAllByText since "analyses" appears multiple times
      const elements = screen.getAllByText(/analyses/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it("displays assistant messages counter", () => {
      render(<UsageSummary />);
      // Should display messages label
      expect(screen.getByText(/messages/i)).toBeInTheDocument();
    });
  });

  describe("Custom className", () => {
    it("accepts custom className", () => {
      render(<UsageSummary className="custom-summary" />);
      const container = screen.getByText("Utilisation du jour").closest("div");
      expect(container).toHaveClass("custom-summary");
    });
  });
});
