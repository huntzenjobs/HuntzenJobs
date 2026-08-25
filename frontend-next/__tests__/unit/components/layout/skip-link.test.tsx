import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkipLink } from "@/components/ui/skip-link";

describe("SkipLink", () => {
  it("pointe vers une cible principale focalisable unique", () => {
    render(
      <>
        <SkipLink label="Accéder au contenu" />
        <div id="main-content" tabIndex={-1}>
          <span>Contenu</span>
        </div>
      </>,
    );

    expect(screen.getByRole("link", { name: "Accéder au contenu" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(document.querySelectorAll("#main-content")).toHaveLength(1);
    expect(document.getElementById("main-content")).toHaveAttribute(
      "tabindex",
      "-1",
    );

    fireEvent.click(screen.getByRole("link", { name: "Accéder au contenu" }));
    expect(document.getElementById("main-content")).toHaveFocus();
  });
});
