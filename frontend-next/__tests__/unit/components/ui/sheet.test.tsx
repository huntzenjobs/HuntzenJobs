import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function SheetFixture() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>Ouvrir</SheetTrigger>
      <SheetContent closeLabel="Fermer le menu">
        <SheetTitle>Navigation</SheetTitle>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("utilise le nom accessible fourni pour son bouton de fermeture", () => {
    render(<SheetFixture />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));

    expect(
      screen.getByRole("button", { name: "Fermer le menu" }),
    ).toBeInTheDocument();
  });
});
