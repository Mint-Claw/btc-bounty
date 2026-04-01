"use client";

/**
 * Global error boundary — catches errors in the root layout.
 * This is the last resort error handler for the entire app.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md px-6">
          <div className="text-6xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-gray-400 mb-6">
            BTC-Bounty encountered an unexpected error. Our team has been
            notified.
          </p>
          {error.digest && (
            <p className="text-xs text-gray-600 mb-4 font-mono">
              Error: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="px-6 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
