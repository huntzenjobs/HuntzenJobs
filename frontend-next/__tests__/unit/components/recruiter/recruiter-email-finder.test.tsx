import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecruiterEmailFinder } from "@/components/recruiter/recruiter-email-finder";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: null }),
}));

describe("RecruiterEmailFinder", () => {
  it("nomme la recherche et traduit son action", () => {
    render(<RecruiterEmailFinder companyName="" />);

    expect(screen.getByLabelText("companyPlaceholder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "search" })).toBeDisabled();
  });
});
