'use client'

import { useState } from 'react'

export default function SentryTestPage() {
  const [tested, setTested] = useState(false)

  const triggerError = () => {
    setTested(true)
    // Trigger a test error that Sentry should catch
    throw new Error('🧪 Test error from frontend - Sentry should catch this!')
  }

  const triggerAsyncError = async () => {
    setTested(true)
    // Simulate an async error (like failed API call)
    await new Promise((resolve) => setTimeout(resolve, 100))
    throw new Error('🧪 Async test error - Sentry should catch this too!')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🧪 Sentry Test Page
            </h1>
            <p className="text-gray-600">
              Utilisez les boutons ci-dessous pour tester l'intégration Sentry.
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">
              📋 Instructions
            </h2>
            <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
              <li>Cliquez sur un des boutons pour déclencher une erreur</li>
              <li>Ouvrez la console du navigateur (F12) pour voir les logs</li>
              <li>Allez sur <a href="https://sentry.io" target="_blank" rel="noopener noreferrer" className="underline">sentry.io</a></li>
              <li>Vérifiez l'onglet "Issues" de votre projet</li>
              <li>L'erreur devrait apparaître dans 30-60 secondes</li>
            </ol>
          </div>

          {/* Test Buttons */}
          <div className="space-y-4">
            <div>
              <button
                onClick={triggerError}
                className="w-full px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-semibold shadow-md hover:shadow-lg"
              >
                🔴 Déclencher Erreur Synchrone
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Déclenche une erreur immédiate (throw Error)
              </p>
            </div>

            <div>
              <button
                onClick={triggerAsyncError}
                className="w-full px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-semibold shadow-md hover:shadow-lg"
              >
                🟠 Déclencher Erreur Asynchrone
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Déclenche une erreur dans une Promise (async/await)
              </p>
            </div>
          </div>

          {/* Status */}
          {tested && (
            <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-medium">
                ✅ Erreur déclenchée! Vérifiez:
              </p>
              <ul className="list-disc list-inside text-green-700 text-sm mt-2 space-y-1">
                <li>Console du navigateur (F12)</li>
                <li>Dashboard Sentry dans ~30-60 secondes</li>
              </ul>
            </div>
          )}

          {/* Debug Info */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              🔍 Debug Info
            </h3>
            <div className="bg-gray-50 rounded p-3 text-xs font-mono text-gray-600 space-y-1">
              <div>
                <span className="font-semibold">DSN:</span>{' '}
                {process.env.NEXT_PUBLIC_SENTRY_DSN ? '✅ Configuré' : '❌ Non configuré'}
              </div>
              <div>
                <span className="font-semibold">Environment:</span>{' '}
                {process.env.NODE_ENV}
              </div>
              <div>
                <span className="font-semibold">URL:</span>{' '}
                {typeof window !== 'undefined' ? window.location.href : 'N/A'}
              </div>
            </div>
          </div>

          {/* Back Link */}
          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              ← Retour à l'accueil
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
