import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import ExpatPage from "@/app/(dashboard)/expat/page";
import expatData from "@/data/expat-data.json";

const { askExpat, session, translate } = vi.hoisted(() => ({
  askExpat: vi.fn(),
  session: { access_token: "test-token" },
  translate: (key: string, values?: Record<string, unknown>) => values?.country ? `${key} ${values.country}` : key,
}));
vi.mock("next-intl", () => ({ useTranslations: () => translate, useLocale: () => "fr" }));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ session }) }));
vi.mock("@/components/auth/page-gate", () => ({ PageGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/api/huntzen-client", () => ({ huntzenApi: { askExpat } }));

beforeEach(() => {
  askExpat.mockReset().mockResolvedValue({ response: "Réponse de test" });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

it.each(expatData.countries)("envoie le pays sélectionné : $name", async (country) => {
  const user = userEvent.setup();
  render(<ExpatPage />);
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: `${country.flag} ${country.name}` }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Quel pays ?" } });
  await user.click(screen.getByRole("button", { name: "send" }));
  await waitFor(() => expect(askExpat).toHaveBeenCalledWith(expect.objectContaining({
    message: `[Pays de destination : ${country.name}] Quel pays ?`,
  })));
});

it("indique la devise des salaires en euros", async () => {
  const user = userEvent.setup();
  render(<ExpatPage />);
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: /Allemagne/ }));
  expect(screen.getAllByText(/€.*salaryPerYear/).length).toBeGreaterThan(0);
});

it("adapte les questions proposées au pays sélectionné", async () => {
  const user = userEvent.setup();
  render(<ExpatPage />);
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: /Allemagne/ }));
  await user.click(screen.getByRole("button", { name: "suggestion1 Allemagne" }));
  await waitFor(() => expect(askExpat).toHaveBeenCalledWith(expect.objectContaining({
    message: "[Pays de destination : Allemagne] suggestion1 Allemagne",
  })));
});
