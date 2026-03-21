import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ThemeToggle } from "@/components/theme/theme-toggle"

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      toggleAriaLabel: "Changer le theme",
      appearance: "Apparence",
      light: "Clair",
      dark: "Sombre",
      system: "Systeme",
      switchToLight: "Passer en mode clair",
      switchToDark: "Passer en mode sombre",
    }
    return translations[key] || key
  },
}))

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => {
      const { initial, animate, transition, ...rest } = props as Record<string, unknown>
      return <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
    },
    span: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => {
      const { initial, animate, transition, layoutId, ...rest } = props as Record<string, unknown>
      return <span {...(rest as React.HTMLAttributes<HTMLSpanElement>)}>{children}</span>
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("ThemeToggle", () => {
  it("renders the toggle button", () => {
    render(<ThemeToggle />)
    const button = screen.getByRole("button", { name: "Changer le theme" })
    expect(button).toBeInTheDocument()
  })

  it("renders sun or moon icon", () => {
    render(<ThemeToggle />)
    // The button should contain an SVG icon
    const button = screen.getByRole("button", { name: "Changer le theme" })
    const svg = button.querySelector("svg")
    expect(svg).toBeInTheDocument()
  })
})
