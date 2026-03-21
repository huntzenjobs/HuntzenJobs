import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

// Mock next-intl/server
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((key: string) => {
      const translations: Record<string, string> = {
        title: "404",
        description: "Page introuvable",
        backHome: "Retour a l'accueil",
      }
      return translations[key] || key
    }),
}))

// The NotFound component is async (Server Component),
// so we test the rendered output by importing and calling it
import NotFound from "@/app/not-found"

describe("NotFound Page", () => {
  it("renders with 404 title", async () => {
    const Component = await NotFound()
    render(Component)
    expect(screen.getByText("404")).toBeInTheDocument()
  })

  it("renders description text", async () => {
    const Component = await NotFound()
    render(Component)
    expect(screen.getByText("Page introuvable")).toBeInTheDocument()
  })

  it("renders back home link", async () => {
    const Component = await NotFound()
    render(Component)
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "/")
    expect(link).toHaveTextContent("Retour a l'accueil")
  })
})
