import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

describe("Dialog", () => {
  it("reste au-dessus du consentement et nomme sa fermeture", () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="Fermer la fenêtre">
          <DialogTitle>Confirmation</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("dialog", { name: "Confirmation" })).toHaveClass(
      "z-[10000]",
    );
    expect(
      screen.getByRole("button", { name: "Fermer la fenêtre" }),
    ).toHaveClass("size-11");
  });
});
