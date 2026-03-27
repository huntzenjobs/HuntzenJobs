import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ErrorBoundary } from "@/components/error-boundary"

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: "Une erreur est survenue",
      description: "Quelque chose s'est mal passe.",
      retry: "Reessayer",
      backHome: "Retour a l'accueil",
    }
    return translations[key] || key
  },
}))

// Mock Sentry
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

// Component that throws an error
function ThrowingComponent(): never {
  throw new Error("Test error")
}

// Suppress console.error for expected error boundary triggers
const originalConsoleError = console.error

describe("ErrorBoundary", () => {
  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>Contenu normal</div>
      </ErrorBoundary>
    )
    expect(screen.getByText("Contenu normal")).toBeInTheDocument()
  })

  it("renders fallback UI when a child component throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText("Une erreur est survenue")).toBeInTheDocument()
  })

  it("renders retry button in fallback", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText("Reessayer")).toBeInTheDocument()
  })

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Erreur custom</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText("Erreur custom")).toBeInTheDocument()
  })
})
