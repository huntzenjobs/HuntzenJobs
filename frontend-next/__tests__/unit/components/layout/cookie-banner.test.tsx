import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { CookieBanner } from "@/components/layout/cookie-banner"

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      ariaLabel: "Banniere cookies",
      message: "Nous utilisons des cookies.",
      learnMore: "En savoir plus",
      decline: "Refuser",
      accept: "Accepter",
      close: "Fermer",
    }
    return translations[key] || key
  },
}))

describe("CookieBanner", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("renders when no consent has been given", () => {
    render(<CookieBanner />)
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeInTheDocument()
  })

  it("renders accept and decline buttons", () => {
    render(<CookieBanner />)
    expect(screen.getByText("Accepter")).toBeInTheDocument()
    expect(screen.getByText("Refuser")).toBeInTheDocument()
  })

  it("hides after accepting cookies", () => {
    const { container } = render(<CookieBanner />)
    fireEvent.click(screen.getByText("Accepter"))
    expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument()
    expect(localStorage.getItem("huntzen_cookie_consent")).toBe("accepted")
  })

  it("hides after declining cookies", () => {
    const { container } = render(<CookieBanner />)
    fireEvent.click(screen.getByText("Refuser"))
    expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument()
    expect(localStorage.getItem("huntzen_cookie_consent")).toBe("declined")
  })

  it("does not render if consent was already given", () => {
    localStorage.setItem("huntzen_cookie_consent", "accepted")
    const { container } = render(<CookieBanner />)
    expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument()
  })
})
