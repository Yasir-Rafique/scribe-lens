// src/app/how-it-works/page.tsx
import React from "react";
import Link from "next/link";
import NavBar from "../../components/Navbar";

function Step({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center text-center p-4 bg-white border rounded-lg shadow-sm">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-xs text-gray-600">{desc}</div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />

      <div className="mx-auto max-w-3xl p-6 space-y-6">
        {/* Tiles / Steps */}
        <section className="rounded-2xl border bg-white p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Step
              title="1) Upload"
              desc="You upload a PDF. The file is processed server-side to extract text."
            />
            <div className="flex items-center justify-center">
              <svg
                width="48"
                height="24"
                viewBox="0 0 48 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M2 12h44" stroke="#CBD5E1" strokeWidth="2" />
                <path d="M40 8l4 4-4 4" stroke="#CBD5E1" strokeWidth="2" />
              </svg>
            </div>
            <Step
              title="2) Chunk & Refine"
              desc="Text is split into chunks and refined to remove duplicates and create consistent pieces."
            />
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Step
              title="3) Embeddings"
              desc="Each chunk is converted into vectors (embeddings) for semantic search."
            />
            <div className="flex items-center justify-center">
              <svg
                width="48"
                height="24"
                viewBox="0 0 48 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M2 12h44" stroke="#CBD5E1" strokeWidth="2" />
                <path d="M40 8l4 4-4 4" stroke="#CBD5E1" strokeWidth="2" />
              </svg>
            </div>
            <Step
              title="4) Store & Retrieve"
              desc="Embeddings are stored; when you ask a question we retrieve the most relevant chunks."
            />
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Step
              title="5) LLM + Context"
              desc="We feed top retrieved chunks as context to the model and ask it to answer using only that context."
            />
            <div className="flex items-center justify-center">
              <svg
                width="48"
                height="24"
                viewBox="0 0 48 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M2 12h44" stroke="#CBD5E1" strokeWidth="2" />
                <path d="M40 8l4 4-4 4" stroke="#CBD5E1" strokeWidth="2" />
              </svg>
            </div>
            <Step
              title="6) Answer & Cite"
              desc="The model returns an answer. We show the answer plus the snippets used so you can verify."
            />
          </div>

          <div className="mt-6 text-sm text-gray-600">
            <strong>Safety features:</strong> metadata-first quick answers,
            lexical fallback if embeddings miss, and a polite fallback that
            avoids hallucination when no evidence exists.
          </div>
        </section>

        {/* Main detailed card */}
        <section className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold">High-level summary</h2>
          <p className="text-sm text-gray-700">
            This application is a{" "}
            <strong>Retrieval-Augmented Generation (RAG)</strong> system: when
            you upload a document we convert it into retrievable vectors
            (embeddings), store those vectors in a local vector store
            (file-based for MVP), and at query time we retrieve the most
            relevant passages and feed them into a language model to produce an
            answer.
          </p>

          {/* Pipeline diagram (compact inline layout matching your UI) */}
          <div className="mt-2 rounded-md bg-gray-50 p-4">
            <div className="text-sm font-medium mb-3">
              Pipeline (upload → answer)
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex-1 text-center">
                Upload
                <br />
                <span className="block text-xs text-gray-500">PDF</span>
              </div>
              <div className="w-6 text-center hidden sm:block">→</div>
              <div className="flex-1 text-center">
                Text Extraction
                <br />
                <span className="block text-gray-500">
                  OCR / text extraction
                </span>
              </div>
              <div className="w-6 text-center hidden sm:block">→</div>
              <div className="flex-1 text-center">
                Chunking & Refinement
                <br />
                <span className="block text-gray-500">
                  split, dedupe, refine
                </span>
              </div>
              <div className="w-6 text-center hidden sm:block">→</div>
              <div className="flex-1 text-center">
                Embeddings + Vector Store
                <br />
                <span className="block text-gray-500">
                  vector files + status
                </span>
              </div>
              <div className="w-6 text-center hidden sm:block">→</div>
              <div className="flex-1 text-center">
                Query → Retrieve → Generate
                <br />
                <span className="block text-gray-500">
                  top-K, context → LLM
                </span>
              </div>
            </div>
          </div>

          <h3 className="text-md font-semibold">
            Key technical concepts (glossary)
          </h3>
          <div className="space-y-2 text-sm text-gray-700">
            <div>
              <strong>Retrieval-Augmented Generation (RAG)</strong>: a pattern
              that first retrieves relevant document passages via semantic
              search and then conditions a generative model (LLM) on those
              passages to produce grounded answers.
            </div>

            <div>
              <strong>Embeddings</strong>: numeric vectors representing the
              semantic meaning of text. We use an embedding model ({" "}
              <code>text-embedding-3-small</code>) to convert chunks and queries
              into vectors so we can measure similarity.
            </div>

            <div>
              <strong>Vector store / Index</strong>: a persistent store for
              embeddings and their source text. MVP: file-based per-PDF JSON.
              Production: FAISS, Milvus, or managed vector DB.
            </div>

            <div>
              <strong>Cosine similarity</strong>: a standard metric to score
              similarity between the query vector and document vectors (higher
              score = more similar). Used to rank and pick top candidates.
            </div>

            <div>
              <strong>Top-K retrieval</strong>: select the K most relevant
              chunks (e.g. <code>topK=8–10</code>) to include as context for the
              LLM; reduces noise and keeps prompt size manageable.
            </div>

            <div>
              <strong>Chunking & deduplication</strong>: large documents are
              split into smaller chunks before embedding. Duplicate or
              near-duplicate chunks are removed or merged to avoid overwhelming
              retrieval.
            </div>

            <div>
              <strong>Context window & token budgeting</strong>: LLM requests
              have a max token window; the sum of retrieved context tokens +
              question tokens must fit within the model limits. This drives
              chunk sizing and top-K selection.
            </div>

            <div>
              <strong>Prompt engineering (system vs user)</strong>: we craft a
              system prompt that instructs the LLM to rely on provided context
              only, and to respond with a polite fallback when evidence is
              absent.
            </div>

            <div>
              <strong>Hallucination mitigation</strong>: models can fabricate
              answers. Mitigations: (1) provide retrieved evidence snippets
              (will introduce soon), (2) instruct the model to refuse or say the
              info isn't found, (3) apply conservative generation settings (low
              temperature).
            </div>

            <div>
              <strong>Batching</strong>: embedding API calls are batched (e.g.
              batchSize=32–128) to improve throughput and reduce per-call
              overhead and cost.
            </div>

            <div>
              <strong>Status & provenance</strong>: embedding jobs write status
              metadata (e.g. <code>vector/status/{`<pdfId>`}.json</code>) so the
              UI can poll progress. Returned answers include source snippets for
              verification.
            </div>

            <div>
              <strong>Summary hints & retrievalQuery</strong>: optionally use a
              short summary (previously generated) or an expanded retrieval
              query to bias retrieval toward the document’s main themes.
            </div>

            {/* <div>
              <strong>ANN (Approximate Nearest Neighbour)</strong>: for
              large-scale deployments we used ANN indexes (e.g. HNSW, IVF/FAISS)
              to speed up nearest-neighbour search. MVP uses exact/naive scoring
              on per-document vectors.
            </div> */}

            <div>
              <strong>Recall vs Precision tradeoff</strong>: retrieving many
              chunks (high recall) increases chance of including the answer but
              may add noise; retrieving few (high precision) reduces noise but
              may miss context. Top-K and thresholds balance this.
            </div>

            <div>
              <strong>Semantic vs keyword search</strong>: embeddings enable
              semantic matching beyond exact keywords. A lightweight keyword
              fallback is useful when embeddings produce weak matches.
            </div>

            {/* <div>
              <strong>Model selection & temperature</strong> — choose model and
              generation parameters according to task: low temperature +
              deterministic model for factual Q&A; higher temperature for
              creative tasks.
            </div> */}

            {/* <div>
              <strong>RLHF / Safety tuning</strong> — (advanced) some models are
              fine-tuned using Reinforcement Learning from Human Feedback to
              align behavior, reduce toxicity, and improve helpfulness.
            </div> */}

            {/* <div>
              <strong>Provenance & auditability</strong> — always surface exact
              source snippets, and persist status files and vector files so
              actions can be audited and deletions can be performed reliably.
            </div> */}
          </div>

          <h3 className="text-md font-semibold">
            Detailed pipeline (what the code does)
          </h3>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2">
            <li>
              <strong>Upload & extract</strong>: server reads uploaded PDF and
              extracts text. If extraction fails (scanned images), we return a
              helpful warning so the user can OCR externally.
            </li>
            <li>
              <strong>Chunking</strong>: <code>chunkText</code> splits text into
              manageable pieces; <code>refineChunks</code> dedupes and cleans
              each chunk for embedding.
            </li>
            <li>
              <strong>Fire-and-forget embedding job</strong>: upload returns
              immediately with a <code>pdfId</code>; an asynchronous job batches
              text chunks to the embeddings API and writes:
              <ul className="list-disc list-inside">
                <li>
                  <code>vector/{`<pdfId>`}.json</code> incremental vector file
                  (id, text, embedding)
                </li>
                <li>
                  <code>vector/status/{`<pdfId>`}.json</code> progress metadata
                  the UI polls
                </li>
              </ul>
            </li>
            <li>
              <strong>UI polling</strong>: front-end polls{" "}
              <code>/api/embeddings/status?pdfId=...</code> (persisted locally
              to survive refresh) to show a robust progress bar + percentage.
            </li>
            <li>
              <strong>Query-time retrieval</strong>: on <code>/api/ask</code>{" "}
              the server:
              <ol className="list-decimal list-inside">
                <li>embeds the query using the same embeddings model,</li>
                <li>calculates cosine similarity vs stored vectors,</li>
                <li>
                  selects top-K snippets (optionally merges multiple retrieval
                  passes and dedupes),
                </li>
                <li>
                  and builds a conservative system+user prompt that pins the LLM
                  to answer from those snippets.
                </li>
              </ol>
            </li>
            <li>
              <strong>Generative step</strong>: server calls a chat/completion
              model (<code>gpt-4o-mini</code>) with assembled context. The
              result is returned along with selected context snippets for user
              verification.
            </li>
          </ol>

          <h3 className="text-sm font-semibold">
            MVP practical recommendations
          </h3>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-2">
            <li>
              <strong>Document size target:</strong> For Phase 1 prefer
              small/medium docs (≤ 25–30 pages), faster, cheaper, and more
              accurate in a file-based vector store.
            </li>
            <li>
              <strong>Batch embeddings:</strong> Use batch sizes (32–128) to
              balance latency and cost.
            </li>
            <li>
              <strong>Top-K & thresholds:</strong> Start with{" "}
              <code>topK=8–10</code> and a heuristic threshold (e.g. similarity
              &gt; 0.55) for "good matches"; fall back to keyword search if
              semantic retrieval is weak.
            </li>
            {/* <li>
              <strong>Provenance:</strong> Always show source snippets + scores
              and a clear fallback message if the model cannot find evidence.
            </li> */}
            <li>
              <strong>Privacy:</strong> Enforce PDF-only uploads for V1, display
              retention & deletion rules clearly, and provide a permanent-delete
              option that removes vectors, status files, and conversation
              history.
            </li>
          </ul>

          <h3 className="text-sm font-semibold">
            Quick reference API & file mapping (MVP)
          </h3>
          <div className="text-xs text-gray-600 space-y-1">
            <div>
              <code>POST /api/upload</code> → extract, chunk, refine, return{" "}
              <code>pdfId</code> and launch embeddings job.
            </div>
            <div>
              <code>POST /api/embeddings</code> → batch embed chunks, write{" "}
              <code>vector/{`<pdfId>`}.json</code> and{" "}
              <code>vector/status/{`<pdfId>`}.json</code>.
            </div>
            <div>
              <code>GET /api/embeddings/status?pdfId=...</code> → read status
              file for UI progress and percentage.
            </div>
            <div>
              <code>POST /api/ask</code> → embed query, retrieve top-K, call
              LLM, return answer + selected context.
            </div>
          </div>

          <h3 className="text-sm font-semibold">Safety & operational notes</h3>
          <p className="text-sm text-gray-700">
            This product produces generated content (a Gen AI + RAG system) and
            requires strong guardrails: label generated text clearly, surface
            the exact source snippets, avoid accepting sensitive PII without
            explicit controls, and provide a transparent permanent-delete
            option. Also include user-facing disclaimers about possible
            errors/hallucinations.
          </p>
        </section>

        <footer className="text-xs text-gray-500">
          Technical summary - Happy to expand any glossary entry into a separate
          technical page (ANN indexes, FAISS, scaling strategies, prompt
          templates, RLHF, etc.).
        </footer>
      </div>
    </main>
  );
}
