// src/app/ethics/page.tsx
import React from "react";
import NavBar from "../../components/Navbar";

export default function EthicsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Ethics & Responsible Use</h1>
          <p className="mt-1 text-sm text-gray-600">
            Our goal is to provide a helpful document Q&A while protecting user
            data, preventing harm, and being transparent about limitations.
          </p>
        </header>

        <section className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold">Core Principles</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
            <li>
              <strong>Transparency:</strong> We show where answers come from
              (context snippets & sources). The assistant will avoid making
              claims that cannot be supported by the uploaded document.
            </li>
            <li>
              <strong>User control & consent:</strong> You choose which PDFs to
              upload, and can remove or permanently delete them. We never use
              your documents to train shared models.
            </li>
            <li>
              <strong>Data minimization:</strong> We only store embeddings and
              minimal metadata needed for retrieval; we do not keep extra copies
              of uploaded files on the client UI.
            </li>
            <li>
              <strong>Privacy & security:</strong> Access to stored data should
              be limited (server-side controls). Use encrypted transport (HTTPS)
              and secure API keys on the server.
            </li>
            <li>
              <strong>Human oversight:</strong> AI answers are suggestions — not
              authoritative decisions. Always verify against the original
              document and consult a qualified human when necessary.
            </li>
            <li>
              <strong>Non-hallucination safeguard:</strong> The system prefers
              and cites explicit document context; when evidence is missing the
              assistant will say it could not find the information.
            </li>
            <li>
              <strong>Accountability & feedback:</strong> Provide an easy
              mechanism for users to report incorrect or harmful outputs so the
              system can be improved.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            Practical Guidance for Users
          </h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
            <li>
              Do not upload documents that you are not authorized to share.
              Confidential or regulated documents require additional controls.
            </li>
            <li>
              Verify important facts against the original document and external
              authoritative sources before acting.
            </li>
            <li>
              Use the &quot;remove&quot; or &quot;permanently delete&quot;
              actions when you no longer want a document retained by this app.
            </li>
            <li>
              If the assistant says it could&apos;t find an answer, try
              rephrasing the question or ask about a narrower passage (e.g., a
              chapter or heading).
            </li>
          </ol>
        </section>

        <section className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            Developer / Operator Responsibilities
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
            <li>
              Maintain clear logs for debugging and abuse investigation, while
              respecting user privacy.
            </li>
            <li>Use rate limits and access controls to prevent misuse.</li>
            <li>
              Document known limitations and keep the model & retrieval stack
              updated.
            </li>
            <li>
              Provide an accessible contact and a clear process to request data
              deletion or report problems.
            </li>
          </ul>
        </section>

        <footer className="text-xs text-gray-500">
          These ethics guidelines are living. You should iterate them as you
          collect feedback and discover real-world failure modes.
        </footer>
      </div>
    </main>
  );
}
