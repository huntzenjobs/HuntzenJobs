import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import ErrorPage from "@/app/error"

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: "Erreur",
      description: "Une erreur inattendue s'est produite.",
      retry: "Reessayer",
      home: "Accueil",
    }
    return translations[key] || key
  },
}))

// Mock Sentry
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

describe("Error Page", () => {
  const mockError = new Error("Test error message")
  const mockReset = vi.fn()

  it("renders error title", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    expect(screen.getByText("Erreur")).toBeInTheDocument()
  })

  it("renders error description", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    expect(
      screen.getByText("Une erreur inattendue s'est produite.")
    ).toBeInTheDocument()
  })

  it("renders retry button", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    expect(screen.getByText("Reessayer")).toBeInTheDocument()
  })

  it("renders home button", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    expect(screen.getByText("Accueil")).toBeInTheDocument()
  })

  it("calls reset when retry button is clicked", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    screen.getByText("Reessayer").closest("button")?.click()
    expect(mockReset).toHaveBeenCalledTimes(1)
  })
})
