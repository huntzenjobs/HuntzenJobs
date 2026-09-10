import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProcessingSteps } from "@/components/cv/processing-steps";

describe("ProcessingSteps", () => {
  it("affiche une attente réaliste et permet de quitter la page", () => {
    render(<ProcessingSteps status="processing" elapsedTime={57} />);

    expect(screen.getByText("processing.expectedDuration")).toBeInTheDocument();
    expect(screen.getByText("processing.canLeave")).toBeInTheDocument();
    expect(screen.getByText("57s")).toBeInTheDocument();
    expect(screen.queryByText("8-12s")).not.toBeInTheDocument();
  });
});
