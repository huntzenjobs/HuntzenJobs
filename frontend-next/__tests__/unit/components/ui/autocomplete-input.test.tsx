import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutocompleteInput } from "@/components/ui/autocomplete-input";

describe("AutocompleteInput", () => {
  it("n'affiche pas un résultat vide pendant le délai de recherche", () => {
    render(<AutocompleteInput value="" onChange={vi.fn()} onSearch={vi.fn(() => new Promise<never>(() => {}))} emptyMessage="Aucun résultat" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Paris" } });
    expect(screen.queryByText("Aucun résultat")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("distingue une erreur réseau d'une recherche sans résultat", async () => {
    render(<AutocompleteInput value="" onChange={vi.fn()} onSearch={vi.fn().mockRejectedValue(new Error("network"))} debounceMs={0} emptyMessage="Aucun résultat" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Paris" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("searchError");
    expect(screen.queryByText("Aucun résultat")).not.toBeInTheDocument();
  });
  it("ne lance pas de recherche lorsque le champ est désactivé", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);

    render(
      <AutocompleteInput
        value="Paris"
        onChange={vi.fn()}
        onSearch={onSearch}
        debounceMs={0}
        disabled
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onSearch).not.toHaveBeenCalled();
  });
});
