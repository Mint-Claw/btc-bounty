"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PathMethod {
  summary?: string;
  description?: string;
  security?: { apiKey: [] }[];
  requestBody?: {
    required?: boolean;
    content?: {
      "application/json"?: {
        schema?: {
          type: string;
          required?: string[];
          properties?: Record<string, { type: string; enum?: string[]; minimum?: number; maxLength?: number; maxItems?: number; items?: { type: string } }>;
        };
      };
    };
  };
  responses?: Record<string, { description: string }>;
}

interface ApiDoc {
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, PathMethod>>;
}

const METHOD_COLORS: Record<string, string> = {
  get: "bg-green-500/20 text-green-400 border-green-500/40",
  post: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  put: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  delete: "bg-red-500/20 text-red-400 border-red-500/40",
};

export default function DocsPage() {
  const [docs, setDocs] = useState<ApiDoc | null>(null);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/docs")
      .then((r) => r.json())
      .then((data) => {
        if (data?.paths) setDocs(data);
      })
      .catch(console.error);
  }, []);

  if (!docs) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <span className="text-4xl animate-pulse">⚡</span>
      </main>
    );
  }

  const paths = Object.entries(docs.paths ?? {});

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">← Home</Link>
          <span className="text-zinc-600 mx-2">|</span>
          <span className="text-sm text-zinc-500">API Documentation</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-orange-400 mb-2">{docs.info.title}</h1>
          <p className="text-zinc-400">{docs.info.description}</p>
          <div className="flex items-center gap-4 mt-3 text-sm text-zinc-500">
            <span>Version {docs.info.version}</span>
            <span>•</span>
            <a href="/api/docs" className="text-orange-400 hover:underline">OpenAPI JSON →</a>
          </div>
        </div>

        {/* Auth note */}
        <div className="border border-zinc-800 rounded-lg p-4 mb-8 bg-zinc-900/50">
          <h3 className="text-sm font-semibold text-zinc-400 mb-2">🔐 Authentication</h3>
          <p className="text-sm text-zinc-300">
            Protected endpoints require an <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-orange-400">X-API-Key</code> header.
            Endpoints marked with 🔒 require authentication.
          </p>
        </div>

        {/* Endpoints */}
        <div className="space-y-3">
          {paths.map(([path, methods]) =>
            Object.entries(methods ?? {}).map(([method, info]) => {
              const key = `${method}:${path}`;
              const isExpanded = expandedPath === key;
              const requiresAuth = info.security && info.security.length > 0;
              const schema = info.requestBody?.content?.["application/json"]?.schema;

              return (
                <div
                  key={key}
                  className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedPath(isExpanded ? null : key)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition"
                  >
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded border uppercase ${METHOD_COLORS[method] ?? "bg-zinc-800 text-zinc-400"}`}
                    >
                      {method}
                    </span>
                    <code className="text-sm text-zinc-300 font-mono">{path}</code>
                    {requiresAuth && <span className="text-xs" title="Requires API key">🔒</span>}
                    <span className="text-sm text-zinc-500 ml-auto hidden sm:inline">
                      {info.summary}
                    </span>
                    <span className="text-zinc-600 text-sm">{isExpanded ? "▲" : "▼"}</span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-zinc-800">
                      <p className="text-sm text-zinc-400 mt-3">{info.description}</p>

                      {schema?.properties && (
                        <div className="mt-4">
                          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                            Request Body
                          </h4>
                          <div className="bg-zinc-950 border border-zinc-800 rounded p-3 font-mono text-xs space-y-1">
                            {Object.entries(schema.properties ?? {}).map(([prop, propInfo]) => {
                              const isRequired = schema.required?.includes(prop);
                              return (
                                <div key={prop} className="flex items-center gap-2">
                                  <span className="text-orange-400">{prop}</span>
                                  <span className="text-zinc-600">:</span>
                                  <span className="text-zinc-400">
                                    {propInfo.enum ? propInfo.enum.join(" | ") : propInfo.type}
                                  </span>
                                  {isRequired && (
                                    <span className="text-red-400 text-[10px]">required</span>
                                  )}
                                  {propInfo.minimum !== undefined && (
                                    <span className="text-zinc-600">min: {propInfo.minimum}</span>
                                  )}
                                  {propInfo.maxLength !== undefined && (
                                    <span className="text-zinc-600">max: {propInfo.maxLength}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Example curl */}
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                          Example
                        </h4>
                        <pre className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs text-zinc-400 overflow-x-auto">
                          {`curl ${method === "get" ? "" : `-X ${method.toUpperCase()} `}${requiresAuth ? '-H "X-API-Key: YOUR_KEY" ' : ""}https://your-domain${path}`}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
