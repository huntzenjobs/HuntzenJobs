import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutocompleteInput } from "@/components/ui/autocomplete-input";

describe("AutocompleteInput", () => {
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
