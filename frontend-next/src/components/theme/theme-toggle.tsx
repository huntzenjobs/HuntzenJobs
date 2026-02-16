"use client";

/**
 * Theme Toggle Component
 * Toggle Sun/Moon pour switcher entre light/dark/system
 * Utilise next-themes (déjà installé)
 */

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`
            relative w-10 h-10 rounded-full
            border-2 border-gray-200 dark:border-gray-700
            hover:border-[#00D9FF] dark:hover:border-[#00D9FF]
            bg-white dark:bg-gray-800
            transition-all duration-300
            ${className}
          `}
          aria-label="Changer le thème"
        >
          <motion.div
            initial={false}
            animate={{ rotate: resolvedTheme === "dark" ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            {resolvedTheme === "dark" ? (
              <Moon className="h-5 w-5 text-gray-300" />
            ) : (
              <Sun className="h-5 w-5 text-[#00D9FF]" />
            )}
          </motion.div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      >
        <DropdownMenuLabel className="text-gray-900 dark:text-gray-100">
          Apparence
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={`
            cursor-pointer
            hover:bg-gray-100 dark:hover:bg-gray-700
            text-gray-900 dark:text-gray-100
            ${theme === "light" ? "bg-gray-100 dark:bg-gray-700" : ""}
          `}
        >
          <Sun className="mr-2 h-4 w-4" />
          <span>Clair</span>
          {theme === "light" && (
            <span className="ml-auto text-[#00D9FF]">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={`
            cursor-pointer
            hover:bg-gray-100 dark:hover:bg-gray-700
            text-gray-900 dark:text-gray-100
            ${theme === "dark" ? "bg-gray-100 dark:bg-gray-700" : ""}
          `}
        >
          <Moon className="mr-2 h-4 w-4" />
          <span>Sombre</span>
          {theme === "dark" && (
            <span className="ml-auto text-[#00D9FF]">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={`
            cursor-pointer
            hover:bg-gray-100 dark:hover:bg-gray-700
            text-gray-900 dark:text-gray-100
            ${theme === "system" ? "bg-gray-100 dark:bg-gray-700" : ""}
          `}
        >
          <Monitor className="mr-2 h-4 w-4" />
          <span>Système</span>
          {theme === "system" && (
            <span className="ml-auto text-[#00D9FF]">✓</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Variant simplifié - Juste toggle light/dark
 */
export function ThemeToggleSimple({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className={`
        relative w-10 h-10 rounded-full
        border-2 border-gray-200 dark:border-gray-700
        hover:border-[#00D9FF] dark:hover:border-[#00D9FF]
        bg-white dark:bg-gray-800
        transition-all duration-300
        ${className}
      `}
      aria-label={`Passer en mode ${resolvedTheme === "dark" ? "clair" : "sombre"}`}
    >
      <motion.div
        className="flex items-center justify-center"
        initial={false}
        animate={{ rotate: resolvedTheme === "dark" ? 180 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {resolvedTheme === "dark" ? (
          <Moon className="h-5 w-5 text-gray-300" />
        ) : (
          <Sun className="h-5 w-5 text-[#00D9FF]" />
        )}
      </motion.div>
    </Button>
  );
}
