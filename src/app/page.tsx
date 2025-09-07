"use client";
import React, { useEffect, useRef, useState } from "react";
import NavBar from "../components/Navbar";

type Message = {
  role: "user" | "ai";
  text: string;
  sources?: { text: string; score?: number }[];
};

type UploadedDoc = {
  pdfId: string;
  fileName: string;
};

type EmbeddingStatus = {
  pdfId: string;
  total: number;
  processed: number;
  status: "processing" | "done" | "error";
  error?: string | null;
};

const STORAGE_KEY = "ai-doc-qa:uploadedDocs";

type Toast = {
  id: string;
  message: string;
  type?: "info" | "success" | "error";
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UploadedDoc[]) : [];
    } catch {
      return [];
    }
  });
  const [mounted, setMounted] = useState(false);
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(
    uploadedDocs[0]?.pdfId ?? null
  );

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [loadingSummarize, setLoadingSummarize] = useState(false);

  const [confirmPermanentChecked, setConfirmPermanentChecked] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // persist embedding status key
  const EMB_KEY = "ai-doc-qa:embeddingStatus_v1";

  const [embeddingStatus, setEmbeddingStatus] =
    useState<EmbeddingStatus | null>(() => {
      try {
        const raw = localStorage.getItem(EMB_KEY);
        return raw ? (JSON.parse(raw) as EmbeddingStatus) : null;
      } catch {
        return null;
      }
    });

  const pollRef = useRef<number | null>(null);

  // file input ref to clear native input value
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // small toast system
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (
    message: string,
    type: Toast["type"] = "info",
    duration = 4000
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const t: Toast = { id, message, type };
    setToasts((s) => [...s, t]);
    setTimeout(() => {
      setToasts((s) => s.filter((x) => x.id !== id));
    }, duration);
  };

  // conversation storage keys (per-pdf)
  const CONV_KEY = "ai-doc-qa:conversations_v1";
  const SUM_KEY = "ai-doc-qa:summarized_v1";

  const [convMap, setConvMap] = useState<Record<string, Message[]>>(() => {
    try {
      const raw = localStorage.getItem(CONV_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Message[]>) : {};
    } catch {
      return {};
    }
  });

  const [summarizedMap, setSummarizedMap] = useState<Record<string, boolean>>(
    () => {
      try {
        const raw = localStorage.getItem(SUM_KEY);
        return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      } catch {
        return {};
      }
    }
  );

  // persist convMap & summarizedMap
  useEffect(() => {
    try {
      localStorage.setItem(CONV_KEY, JSON.stringify(convMap));
    } catch {}
  }, [convMap]);

  useEffect(() => {
    try {
      localStorage.setItem(SUM_KEY, JSON.stringify(summarizedMap));
    } catch {}
  }, [summarizedMap]);

  // Persist uploadedDocs to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(uploadedDocs));
    } catch {}
  }, [uploadedDocs]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Persist embeddingStatus so a full reload doesn't make the progress bar vanish
  useEffect(() => {
    try {
      if (embeddingStatus) {
        localStorage.setItem(EMB_KEY, JSON.stringify(embeddingStatus));
      } else {
        localStorage.removeItem(EMB_KEY);
      }
    } catch {}
  }, [embeddingStatus]);

  // If we reload during an ongoing job, resume polling (or probe current selected doc)
  useEffect(() => {
    if (!mounted) return;
    if (embeddingStatus?.status === "processing" && embeddingStatus.pdfId) {
      startPollingStatus(embeddingStatus.pdfId);
    } else if (selectedPdfId) {
      startPollingStatus(selectedPdfId);
    }
  }, [mounted]);

  // (avoid duplicates)
  const completedEmbToastRef = useRef<Set<string>>(new Set());

  // When user switches selected PDF, load preserved chat for that pdf
  useEffect(() => {
    const msgs = selectedPdfId ? convMap[selectedPdfId] ?? [] : [];
    setMessages(msgs);
    // Keep embeddingStatus only if it matches selected pdf
    setEmbeddingStatus((prev) =>
      prev && prev.pdfId === selectedPdfId ? prev : null
    );
  }, [selectedPdfId, convMap]);

  // show toast once when embeddingStatus becomes done for a pdfId
  useEffect(() => {
    if (embeddingStatus?.status === "done") {
      const id = embeddingStatus.pdfId;
      if (!completedEmbToastRef.current.has(id)) {
        completedEmbToastRef.current.add(id);
        if (selectedPdfId === id) {
          showToast("Embedding complete. PDF is ready to chat.", "success");
        } else {
          // still notify (use filename if available)
          const doc = uploadedDocs.find((d) => d.pdfId === id);
          if (doc) {
            showToast(`Embedding complete for "${doc.fileName}".`, "success");
          } else {
            showToast("Embedding complete for a PDF.", "success");
          }
        }
      }
    }
  }, [embeddingStatus, selectedPdfId, uploadedDocs]);

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    pdfId: string | null;
    stage: "choose" | "confirmPermanent";
  }>({ open: false, pdfId: null, stage: "choose" });

  // cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  //don’t render until mounted, avoids mismatch
  if (!mounted) {
    return null;
  }

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;

    if (!f) {
      setFile(null);
      return;
    }

    // Strict PDF validation for V1
    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!isPdf) {
      showToast(
        "Only PDF files are allowed in V1. Please upload a PDF.",
        "error"
      );
      input.value = "";
      setFile(null);
      return;
    }

    setFile(f);
  };

  // helper: start polling status
  const startPollingStatus = (pdfId: string) => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const fetchOnceAndMaybeSetInterval = async () => {
      try {
        const res = await fetch(
          `/api/embeddings/status?pdfId=${encodeURIComponent(pdfId)}`
        );

        // Read text first and attempt safe parse
        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (e) {
          json = null;
        }

        if (json?.success && json.status) {
          // Ensure pdfId is present in the status object
          const statusObj = {
            pdfId,
            ...(json.status as any),
          } as EmbeddingStatus;
          setEmbeddingStatus(statusObj);

          if (statusObj.status === "done" || statusObj.status === "error") {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } else {
          // If we couldn't parse JSON (partial file write or dev overlay), keep UI showing "processing"
          setEmbeddingStatus((prev) => {
            // preserve processed/total if previously available
            const preserved =
              prev && prev.pdfId === pdfId
                ? { total: prev.total ?? 0, processed: prev.processed ?? 0 }
                : { total: 0, processed: 0 };
            return {
              pdfId,
              total: preserved.total,
              processed: preserved.processed,
              status: "processing",
              error: null,
            } as EmbeddingStatus;
          });
        }
      } catch (err) {
        console.error("Status poll error:", err);
        // in case of network/other failure, keep UI alive and mark processing
        setEmbeddingStatus((prev) => {
          const preserved =
            prev && prev.pdfId === pdfId
              ? { total: prev.total ?? 0, processed: prev.processed ?? 0 }
              : { total: 0, processed: 0 };
          return {
            pdfId,
            total: preserved.total,
            processed: preserved.processed,
            status: "processing",
            error: null,
          } as EmbeddingStatus;
        });
      }
    };

    // call immediately then every 1s
    fetchOnceAndMaybeSetInterval();
    const id = window.setInterval(fetchOnceAndMaybeSetInterval, 1000);
    pollRef.current = id;
  };

  const uploadFile = async () => {
    if (!file) {
      showToast("Please select a PDF first.", "error");
      return;
    }

    setLoadingUpload(true);
    setEmbeddingStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      console.log("Upload response:", data);

      if (data?.success && data.pdfId) {
        const doc: UploadedDoc = { pdfId: data.pdfId, fileName: file.name };
        setUploadedDocs((prev) => {
          const next = [doc, ...prev.filter((d) => d.pdfId !== doc.pdfId)];
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });

        // select the new doc and clear chat
        setSelectedPdfId(doc.pdfId);
        // ensure conversation map has an entry for this new doc (preserve chats)
        setConvMap((prev) =>
          prev[doc.pdfId] ? prev : { ...prev, [doc.pdfId]: [] }
        );

        // start polling embedding status
        startPollingStatus(data.pdfId);

        showToast("Upload accepted. Embeddings job started.", "success");
      } else {
        // maybe server returned stats without pdfId
        if (data?.rawChunksCount || data?.refinedChunksCount) {
          showToast(
            `Processed but no pdfId returned. Raw: ${data.rawChunksCount}, Refined: ${data.refinedChunksCount}`,
            "error"
          );
        } else {
          showToast(
            `Upload failed: ${data?.error ?? "Unknown error"}`,
            "error"
          );
        }
      }
    } catch (err) {
      console.error("Upload error:", err);
      showToast("Upload failed. check console.", "error");
    } finally {
      setLoadingUpload(false);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // helper to format snippet
  function snippet(text: string, len = 240) {
    const s = text.replace(/\s+/g, " ").trim();
    return s.length <= len ? s : s.slice(0, len) + "…";
  }

  // append a message to the conversation map for the currently selected pdf
  function appendMessageToConv(msg: Message) {
    if (!selectedPdfId) {
      // fallback to UI-only if no doc selected
      setMessages((prev) => [...prev, msg]);
      return;
    }
    setConvMap((prev) => {
      const cur = prev[selectedPdfId] ?? [];
      const next = { ...prev, [selectedPdfId]: [...cur, msg] };
      try {
        localStorage.setItem(CONV_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setMessages((prev) => [...prev, msg]);
  }

  const ask = async () => {
    const q = question.trim();
    if (!q) {
      showToast("Please enter a question.", "error");
      return;
    }
    if (!selectedPdfId) {
      showToast("Please select a PDF to ask about.", "error");
      return;
    }
    if (
      embeddingStatus &&
      embeddingStatus.pdfId === selectedPdfId &&
      embeddingStatus.status === "processing"
    ) {
      const proceed = confirm(
        "Embedding is still processing for the selected PDF. You can wait for it to finish or proceed. Continue?"
      );
      if (!proceed) return;
    }

    appendMessageToConv({ role: "user", text: q });
    setLoadingAsk(true);

    // --- query expansion ---
    const expandQuery = (input: string) => {
      const s = input.toLowerCase();
      const additions: string[] = [];

      if (s.includes("chapter") || s.includes("table of contents")) {
        additions.push("chapters list chapter headings chapter titles index");
      }
      if (s.includes("author") || s.includes("writer")) {
        additions.push("author writer creator byline introduction");
      }
      if (s.includes("literary reference") || s.includes("allusion")) {
        additions.push(
          "references citations quoted mentioned works bibliography extracts sources"
        );
      }
      if (s.includes("summary") || s.includes("summarize")) {
        additions.push("summary overview key points main takeaways");
      }
      if (s.includes("payment") || s.includes("payment terms")) {
        additions.push("billing invoicing payment schedule final payment");
      }

      // small generic boost
      if (additions.length === 0) {
        additions.push("summary key points details clauses");
      }

      return `${input} ${additions.join(" ")}`;
    };

    // --- summary hint ---
    const getSummaryHint = () => {
      if (!selectedPdfId) return null;
      if (!summarizedMap[selectedPdfId]) return null;
      const conv = convMap[selectedPdfId] ?? [];
      for (let i = conv.length - 1; i >= 0; i--) {
        const m = conv[i];
        if (m.role === "ai") {
          const text = (m.text || "").toLowerCase();
          if (text.includes("summary") || (m.text || "").length > 120) {
            return m.text;
          }
        }
      }
      const lastAi = conv
        .slice()
        .reverse()
        .find((x) => x.role === "ai");
      return lastAi ? lastAi.text : null;
    };

    const retrievalQuery = expandQuery(q);
    const summaryHint = getSummaryHint();

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          retrievalQuery,
          pdfId: selectedPdfId,
          topK: 10,
          summaryHint,
        }),
      });

      const data = await res.json();
      console.log("Ask response:", data);

      if (!data?.success) {
        const err = data?.error ?? "Unknown error from /api/ask";
        appendMessageToConv({ role: "ai", text: `❌ Error: ${err}` });
        showToast(`Ask failed: ${err}`, "error");
        return;
      }

      // --- context validation ---
      const contexts = Array.isArray(data.context) ? data.context : [];
      if (contexts.length === 0 || !data.answer) {
        appendMessageToConv({
          role: "ai",
          text: "I couldn’t find that information in the uploaded document. Please try rephrasing your question.",
        });
        setQuestion("");
        return;
      }

      // --- AI message with cleaned sources ---
      const seen = new Set<string>();
      const sources = contexts
        .map((c: any) => (c.text ?? c).trim())
        .filter((txt: string): boolean => {
          if (!txt || seen.has(txt)) return false;
          seen.add(txt);
          return true;
        })
        .slice(0, 5) // keep top 5
        .map((txt: string) => ({ text: snippet(txt, 200) }));

      const aiMsg: Message = {
        role: "ai",
        text: data.answer,
        sources,
      };

      appendMessageToConv(aiMsg);
      setQuestion("");
    } catch (err) {
      console.error("Ask error:", err);
      appendMessageToConv({
        role: "ai",
        text: "❌ Failed to fetch answer. Check console.",
      });
      showToast("Ask failed — check console.", "error");
    } finally {
      setLoadingAsk(false);
    }
  };

  // Helper: synchronize local state when a doc is removed (soft or permanent)
  const localRemoveAndCleanup = (
    pdfId: string,
    nextUploadedDocs?: UploadedDoc[]
  ) => {
    const nextList =
      nextUploadedDocs ?? uploadedDocs.filter((d) => d.pdfId !== pdfId);

    // compute new convMap & summarizedMap without the removed id
    const nextConv = { ...convMap };
    delete nextConv[pdfId];

    const nextSumm = { ...summarizedMap };
    delete nextSumm[pdfId];

    // write local state (synchronously using calculated values)
    setUploadedDocs(nextList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
    } catch {}

    setConvMap(nextConv);
    try {
      localStorage.setItem(CONV_KEY, JSON.stringify(nextConv));
    } catch {}

    setSummarizedMap(nextSumm);
    try {
      localStorage.setItem(SUM_KEY, JSON.stringify(nextSumm));
    } catch {}

    // choose new selection
    const wasSelected = selectedPdfId === pdfId;
    const newSelected = wasSelected
      ? nextList[0]?.pdfId ?? null
      : selectedPdfId;

    setSelectedPdfId(newSelected);

    // set messages to the preserved chat for the new selected or clear
    setMessages(newSelected ? nextConv[newSelected] ?? [] : []);

    // clear embedding status if it belonged to the deleted pdf
    setEmbeddingStatus((prev) => (prev && prev.pdfId === pdfId ? null : prev));
  };

  // summarize handler
  const summarize = async () => {
    if (!selectedPdfId) {
      showToast("Please select a PDF to summarize.", "error");
      return;
    }

    // disallow repeated summarization
    if (selectedPdfId && summarizedMap[selectedPdfId]) {
      showToast("This PDF has already been summarized.", "info");
      return;
    }

    // if embeddings still processing, warn
    if (
      embeddingStatus &&
      embeddingStatus.pdfId === selectedPdfId &&
      embeddingStatus.status === "processing"
    ) {
      const proceed = confirm(
        "Embeddings are still processing for the selected PDF. Summarize now or wait? Continue?"
      );
      if (!proceed) return;
    }

    setLoadingSummarize(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfId: selectedPdfId }),
      });
      const data = await res.json();
      if (!data?.success) {
        const err = data?.error ?? "Unknown error from /api/summarize";
        appendMessageToConv({ role: "ai", text: `❌ Summary error: ${err}` });
        showToast(`Summarize failed: ${err}`, "error");
        return;
      }
      const aiMsg: Message = {
        role: "ai",
        text: data.summary ?? "No summary.",
      };
      // append summary message and mark as summarized for selected pdf
      appendMessageToConv(aiMsg);
      setSummarizedMap((prev) => ({
        ...prev,
        [selectedPdfId as string]: true,
      }));
      showToast("PDF summarized successfully.", "success");
    } catch (err) {
      console.error("Summarize error:", err);
      appendMessageToConv({
        role: "ai",
        text: "❌ Failed to generate summary. Check console.",
      });
      showToast("Summarize failed — check console.", "error");
    } finally {
      setLoadingSummarize(false);
    }
  };

  // small UI helper to remove an uploaded doc (optional soft remove)
  const removeDocument = (pdfId: string) => {
    if (
      !confirm(
        "Remove this PDF from the list? This will only remove it from the UI (server file remains)."
      )
    )
      return;

    // perform local removal + cleanup (preserves other convs)
    localRemoveAndCleanup(pdfId);
    showToast("PDF removed from your list.", "info");
  };

  // --- delete modal state & handlers (replace immediate confirm flow) ---

  const handleDeleteAction = async (pdfId: string) => {
    setConfirmPermanentChecked(false);
    setDeleteModal({ open: true, pdfId, stage: "choose" });
  };

  const handleModalRemoveFromList = (pdfId: string) => {
    localRemoveAndCleanup(pdfId);
    showToast("PDF removed from your list.", "info");
    setDeleteModal({ open: false, pdfId: null, stage: "choose" });
  };

  const performPermanentDelete = async (pdfId: string) => {
    if (!pdfId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfId }),
      });
      const data = await res.json();

      if (data?.success) {
        localRemoveAndCleanup(pdfId);
        showToast(
          "PDF permanently deleted. Chat and retrieval data have been removed.",
          "success"
        );
      } else {
        const err = data?.error ?? "Unknown error from server";
        showToast("Permanent deletion failed: " + err, "error");
      }
    } catch (err) {
      console.error("Permanent delete error:", err);
      showToast("Permanent delete failed — check the console.", "error");
    } finally {
      setDeleteLoading(false);
      setDeleteModal({ open: false, pdfId: null, stage: "choose" });
      setConfirmPermanentChecked(false);
    }
  };
  // --- END delete modal changes ---

  const selectedDoc =
    uploadedDocs.find((d) => d.pdfId === selectedPdfId) ?? null;

  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pt-16">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-sm w-full rounded-lg px-4 py-2 shadow-md text-sm text-white ${
              t.type === "success"
                ? "bg-green-600"
                : t.type === "error"
                ? "bg-red-600"
                : "bg-gray-800"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Delete modal */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() =>
              setDeleteModal({ open: false, pdfId: null, stage: "choose" })
            }
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold">
              {deleteModal.stage === "choose"
                ? "Remove or permanently delete?"
                : "Confirm permanent deletion"}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {deleteModal.stage === "choose" ? (
                <>
                  You can remove this PDF from your list (soft remove), or
                  permanently delete it from the system (removes embeddings,
                  retrieval data, and chat). Choose an action below.
                </>
              ) : (
                <>
                  This action will permanently delete the PDF and ALL derived
                  data. This cannot be undone. Please confirm to proceed.
                </>
              )}
            </p>

            {deleteModal.stage === "choose" ? (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-xl border px-3 py-1 hover:bg-gray-50"
                  onClick={() =>
                    setDeleteModal({
                      open: false,
                      pdfId: null,
                      stage: "choose",
                    })
                  }
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl border px-3 py-1 hover:bg-gray-50"
                  onClick={() =>
                    deleteModal.pdfId &&
                    handleModalRemoveFromList(deleteModal.pdfId)
                  }
                >
                  Remove from list
                </button>
                <button
                  className="rounded-xl border px-3 py-1 text-red-600 hover:bg-red-50"
                  onClick={() =>
                    setDeleteModal((s) => ({ ...s, stage: "confirmPermanent" }))
                  }
                >
                  Permanently delete
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <div className="text-sm text-red-700 mb-3">
                  Permanent deletion is irreversible.
                </div>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmPermanentChecked}
                    onChange={(e) =>
                      setConfirmPermanentChecked(e.target.checked)
                    }
                  />
                  <span className="text-sm">
                    I understand this will permanently delete the PDF and its
                    data.
                  </span>
                </label>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    className="rounded-xl border px-3 py-1 hover:bg-gray-50"
                    onClick={() =>
                      setDeleteModal({
                        open: false,
                        pdfId: null,
                        stage: "choose",
                      })
                    }
                    disabled={deleteLoading}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-xl border px-3 py-1 text-red-700 hover:bg-red-50 disabled:opacity-60"
                    onClick={() =>
                      deleteModal.pdfId &&
                      performPermanentDelete(deleteModal.pdfId)
                    }
                    disabled={!confirmPermanentChecked || deleteLoading}
                  >
                    {deleteLoading ? "Deleting..." : "Permanently delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <header className="space-y-2">
          <div className="flex items-start justify-between">
            {/* <div>
              <h1 className="text-2xl font-bold">AI Document Q&A (Phase 1)</h1>
              <p className="text-sm text-gray-600">
                Ethical note: This is an AI assistant. It can be wrong. Always
                verify with original sources.
              </p>
            </div> */}

            {/* Selected document summary in header */}
            {/* <div className="text-xs text-gray-500 text-right">
              {selectedDoc ? (
                <>
                  <div className="font-medium">Selected PDF</div>
                  <div className="mt-1">{selectedDoc.fileName}</div>
                </>
              ) : (
                <div>No PDF selected</div>
              )}
            </div> */}
          </div>
        </header>

        <section className="rounded-2xl border bg-white p-4 pb-8">
          <h2 className="font-semibold mb-2">1) Upload a document (PDF)</h2>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={onUpload}
            className="block w-full"
          />

          {file && (
            <div className="mt-2 flex gap-2 items-center">
              <p className="text-sm text-gray-600">Selected: {file.name}</p>

              {/* Cancel/clear selection before processing */}
              {!loadingUpload && (
                <button
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    showToast("Upload selection cleared.", "info");
                  }}
                  className="ml-2 rounded-full border px-2 py-0.5 text-sm hover:bg-gray-50"
                  title="Clear selection"
                >
                  ✕
                </button>
              )}

              <button
                onClick={uploadFile}
                disabled={loadingUpload}
                className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                {loadingUpload ? "Processing..." : "Process"}
              </button>
            </div>
          )}
          <div className="text-xs text-gray-500 text-right">
            {selectedDoc ? (
              <>
                <div className="font-medium">Selected PDF</div>
                <div className="mt-1">{selectedDoc.fileName}</div>
              </>
            ) : (
              <div>No PDF selected</div>
            )}
          </div>

          {/* uploaded docs dropdown */}
          {uploadedDocs.length > 0 && (
            <div className="mt-4">
              <label className="text-sm text-gray-500">
                Uploaded documents
              </label>
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <select
                  value={selectedPdfId ?? ""}
                  onChange={(e) => {
                    setSelectedPdfId(e.target.value || null);
                    // load messages from convMap via effect - no need to clear here
                  }}
                  className="rounded-xl border px-3 py-2 flex-1"
                >
                  {uploadedDocs.map((d) => (
                    <option key={d.pdfId} value={d.pdfId}>
                      {d.fileName}
                    </option>
                  ))}
                </select>

                <div className="mt-2 text-sm text-gray-600">
                  {selectedPdfId && (
                    <div>
                      <button
                        onClick={() => {
                          if (selectedPdfId) {
                            handleDeleteAction(selectedPdfId);
                          }
                        }}
                        className="ml-2 text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* progress UI */}
              {embeddingStatus && embeddingStatus.pdfId === selectedPdfId && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                    <div>
                      Embedding: {embeddingStatus.processed ?? 0}/
                      {embeddingStatus.total ?? 0}
                    </div>
                    <div className="text-xs">
                      {embeddingStatus.status.toUpperCase()}
                    </div>
                  </div>

                  {/* progress bar + percent */}
                  <div className="w-full bg-gray-200 rounded-full h-2 relative">
                    {(() => {
                      const total = embeddingStatus.total ?? 0;
                      const processed = embeddingStatus.processed ?? 0;
                      const pct =
                        total > 0 ? Math.round((processed / total) * 100) : 0;
                      return (
                        <>
                          <div
                            style={{ width: `${pct}%`, height: "100%" }}
                            className="bg-blue-500 rounded-full"
                          />
                          <div className="mt-1 text-right text-xs text-gray-600">
                            {pct}%
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-4 space-y-3">
          <h2 className="font-semibold">
            2) Ask a question about the selected PDF
          </h2>

          <div className="mt-4 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <div
                  className={`inline-block rounded-2xl px-3 py-2 ${
                    m.role === "user" ? "bg-blue-50" : "bg-gray-100"
                  }`}
                >
                  <strong>{m.role === "user" ? "You" : "AI"}:</strong>{" "}
                  <span>{m.text}</span>
                </div>
              </div>
            ))}

            {/* Typing / thinking indicator shown */}
            {(loadingAsk || loadingSummarize) && (
              <div className="text-left mt-2">
                <span className="inline-block rounded-2xl px-3 py-2 bg-gray-100">
                  <strong>AI:</strong> <span className="italic">Thinking</span>{" "}
                  <span className="ml-2">
                    <Dots />
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., What are the main requirements?"
              className="flex-1 rounded-xl border px-3 py-2"
            />
            <button
              onClick={ask}
              disabled={
                !!(
                  loadingAsk ||
                  !selectedPdfId ||
                  (embeddingStatus?.pdfId === selectedPdfId &&
                    embeddingStatus?.status === "processing")
                )
              }
              className="rounded-xl border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
            >
              {loadingAsk ? "Thinking..." : "Ask"}
            </button>

            <button
              onClick={summarize}
              disabled={
                !!(
                  loadingSummarize ||
                  !selectedPdfId ||
                  (embeddingStatus?.pdfId === selectedPdfId &&
                    embeddingStatus?.status === "processing") ||
                  (selectedPdfId && summarizedMap[selectedPdfId])
                )
              }
              className="rounded-xl border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
            >
              {selectedPdfId && summarizedMap[selectedPdfId]
                ? "Summarized"
                : loadingSummarize
                ? "Summarizing..."
                : "Summarize"}
            </button>
          </div>
        </section>

        {/* <footer className="text-xs text-gray-500">
          Sources will be shown with each answer. If unsure, the AI will say “I
          don’t know.”
        </footer> */}
      </div>
    </main>
  );
}

// small animated dots component for typing indicator
function Dots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="w-1 h-1 rounded-full bg-gray-500 animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-1 h-1 rounded-full bg-gray-500 animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-1 h-1 rounded-full bg-gray-500 animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
      <style>{`
        .animate-bounce { animation: bounce 900ms infinite; }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: .8 }
          50% { transform: translateY(-6px); opacity: 1 }
        }
      `}</style>
    </span>
  );
}
