// src/components/NavBar.tsx
"use client";

import Link from "next/link";

export default function NavBar() {
  return (
    <nav className="w-full bg-white border-b shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-semibold">
              ScribeLens
            </Link>
            <span className="text-xs text-gray-500">Phase 1</span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/ethics"
              className="text-sm px-3 py-1 rounded-md hover:bg-gray-50"
            >
              Ethics
            </Link>
            <Link
              href="/how-it-works"
              className="text-sm px-3 py-1 rounded-md hover:bg-gray-50"
            >
              How it works
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
