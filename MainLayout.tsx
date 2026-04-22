"use client";

import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { AnimatePresence, motion } from "framer-motion";
import { BoardProvider, useBoardContext } from "@/BoardContext";
import { Check, Link2, Plus, Search, X } from "lucide-react";
import type { TicketHierarchyType } from "@/analyst.types";

const fuzzyScore = (query: string, target: string): number => {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 100 - (t.indexOf(q) || 0);
  let ti = 0;
  let score = 0;
  for (const qc of q) {
    const found = t.indexOf(qc, ti);
    if (found === -1) return -1;
    score += 2;
    ti = found + 1;
  }
  return score;
};

function TicketModalOverlay() {
  const {
    selectedTicket,
    allTickets,
    linkedTickets,
    closeModal,
    openTicket,
    updateTicketField,
    updateTicketWorkflowState,
    updateTicketStoryPoints,
    linkTickets,
    unlinkTickets,
    openCreateTicketLinkedTo,
    openCreateVersion,
    workflowChoicesOrdered,
    releaseVersions,
    getTicketShareUrl,
  } = useBoardContext();
  const [editingField, setEditingField] = useState<
    "title" | "description" | "label" | null
  >(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [showLinkComposer, setShowLinkComposer] = useState(false);
  const [hoverLinkedTicketId, setHoverLinkedTicketId] = useState<string | null>(null);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);

  useEffect(() => {
    setLinkTargetId("");
    setEditingField(null);
    setShowLinkComposer(false);
  }, [selectedTicket?.id]);

  if (!selectedTicket) {
    return null;
  }

  const copyShareLink = async () => {
    const url = getTicketShareUrl(selectedTicket.id);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1200);
  };

  const renderEditableField = (
    field: "title" | "description" | "label",
    className: string,
  ) => {
    const value = selectedTicket[field];
    if (editingField !== field) {
      const Tag = field === "title" ? "h1" : field === "description" ? "p" : "span";
      return (
        <Tag
          onClick={() => setEditingField(field)}
          className={`${className} cursor-text hover:text-zinc-100`}
        >
          {value || "Click to edit"}
        </Tag>
      );
    }

    if (field === "description") {
      return (
        <textarea
          autoFocus
          value={value}
          onChange={(event) =>
            updateTicketField(selectedTicket.id, field, event.target.value)
          }
          onBlur={() => setEditingField(null)}
          className="min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
        />
      );
    }

    return (
      <input
        autoFocus
        value={value}
        onChange={(event) =>
          updateTicketField(selectedTicket.id, field, event.target.value)
        }
        onBlur={() => setEditingField(null)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
      />
    );
  };

  return (
    <div
      onClick={closeModal}
      className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-4 border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              {renderEditableField("title", "text-2xl font-semibold text-zinc-50")}
              <button
                onClick={copyShareLink}
                className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:text-zinc-100"
                title="Copy direct link"
              >
                {linkCopied ? (
                  <Check size={15} className="text-emerald-400" />
                ) : (
                  <Link2 size={15} />
                )}
              </button>
            </div>
            <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500 font-semibold">
              {selectedTicket.ticketNumber} · {selectedTicket.hierarchyType} · {selectedTicket.priority}
            </p>
          </div>
          <button
            onClick={closeModal}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            Close
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
            {renderEditableField("description", "text-sm leading-relaxed text-zinc-300")}
          </div>
          <aside className="grid gap-3">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">Label</p>
              {renderEditableField("label", "mt-1 text-sm text-zinc-200")}
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">Priority</p>
              <p
                className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                  selectedTicket.priority === "high"
                    ? "bg-rose-500/20 text-rose-300"
                    : selectedTicket.priority === "medium"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                {selectedTicket.priority}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Indicates urgency for planning and sequencing.
              </p>
            </div>
            <div className="grid gap-1 text-xs text-zinc-400 font-semibold">
              Workflow
              <button
                onClick={() => setWorkflowMenuOpen((prev) => !prev)}
                className="rounded-md border border-indigo-400/40 bg-zinc-950 px-3 py-2 text-left text-sm font-semibold text-zinc-100"
              >
                {selectedTicket.workflowState}
              </button>
              {workflowMenuOpen && (
                <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950 p-1">
                  {workflowChoicesOrdered.flatMap((entry) =>
                    entry.states.map((stateName) => (
                      <button
                        key={`${entry.columnId}-${stateName}`}
                        onClick={() => {
                          updateTicketWorkflowState(selectedTicket.id, stateName);
                          setWorkflowMenuOpen(false);
                        }}
                        className="mb-1 flex w-full items-center rounded px-2 py-1 text-left text-xs font-semibold text-zinc-100"
                        style={{
                          backgroundColor: `${entry.color}33`,
                          borderLeft: `3px solid ${entry.color}`,
                        }}
                      >
                        {stateName}
                      </button>
                    )),
                  )}
                </div>
              )}
              <p className="text-[11px] text-zinc-500">
                Selecting a state automatically moves the ticket to its mapped column.
              </p>
            </div>
            <label className="grid gap-1 text-xs text-zinc-400 font-semibold">
              Story Points
              <select
                value={selectedTicket.storyPoints}
                onChange={(event) =>
                  updateTicketStoryPoints(
                    selectedTicket.id,
                    Number(event.target.value) as 1 | 2 | 3 | 5 | 8 | 13,
                  )
                }
                className="rounded-md border border-indigo-400/40 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-100"
              >
                {[1, 2, 3, 5, 8, 13].map((points) => (
                  <option key={points} value={points}>
                    {points}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-zinc-400 font-semibold">
              Fix Version
              <div className="flex gap-2">
                <select
                  value={selectedTicket.fixVersion}
                  onChange={(event) =>
                    updateTicketField(selectedTicket.id, "fixVersion", event.target.value)
                  }
                  className="flex-1 rounded-md border border-indigo-400/40 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-100"
                >
                  {releaseVersions.map((version) => (
                    <option key={version.id} value={version.name}>
                      {version.name} · {version.releaseDate}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={openCreateVersion}
                  className="rounded-md border border-indigo-400/40 px-2 py-2 text-indigo-200"
                  title="Create fix version"
                >
                  <Plus size={14} />
                </button>
              </div>
            </label>
          </aside>
        </div>
        <section className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Linked</h3>
            <button
              onClick={() => setShowLinkComposer((prev) => !prev)}
              className="rounded-md border border-indigo-400/40 p-1 text-indigo-200"
              title="Add linked ticket"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {linkedTickets.map((ticket) => (
              <div
                key={ticket.id}
                onMouseEnter={() => setHoverLinkedTicketId(ticket.id)}
                onMouseLeave={() => setHoverLinkedTicketId(null)}
                className="inline-flex items-center gap-1 rounded-md border border-indigo-400/30 px-2 py-1 text-xs text-indigo-200"
              >
                <button onClick={() => openTicket(ticket.id)} className="underline underline-offset-2">
                  {ticket.ticketNumber} · {ticket.title}
                </button>
                {hoverLinkedTicketId === ticket.id && (
                  <button
                    onClick={() => unlinkTickets(selectedTicket.id, ticket.id)}
                    className="text-zinc-300 hover:text-rose-300"
                    title="Unlink"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {!linkedTickets.length && (
              <p className="text-xs text-zinc-500">No linked tickets yet. Use + to add one.</p>
            )}
          </div>
          {showLinkComposer && (
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={linkTargetId}
                onChange={(event) => setLinkTargetId(event.target.value)}
                className="min-w-56 rounded-md border border-indigo-400/40 bg-zinc-950 px-2 py-2 text-xs font-semibold text-zinc-100"
              >
                <option value="">Search ticket to link</option>
                {allTickets
                  .filter((ticket) => ticket.id !== selectedTicket.id)
                  .map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>
                      {ticket.ticketNumber} · {ticket.title}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => {
                  if (!linkTargetId) return;
                  linkTickets(selectedTicket.id, linkTargetId);
                  setLinkTargetId("");
                }}
                className="rounded-md bg-indigo-400 px-3 py-2 text-xs font-semibold text-zinc-950"
              >
                Add link
              </button>
              <button
                onClick={() => openCreateTicketLinkedTo(selectedTicket.id)}
                className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200"
              >
                Create linked ticket
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CreateTicketModal() {
  const {
    activeBoardId,
    boardColumns,
    releaseVersions,
    openCreateVersion,
    createModalOpen,
    createTicket,
    closeModal,
  } =
    useBoardContext();
  const columnsForBoard = useMemo(
    () => boardColumns.filter((column) => column.boardId === activeBoardId),
    [activeBoardId, boardColumns],
  );
  const [form, setForm] = useState<{
    title: string;
    description: string;
    label: string;
    fixVersion: string;
    storyPoints: 1 | 2 | 3 | 5 | 8 | 13;
    hierarchyType: TicketHierarchyType;
    priority: "low" | "medium" | "high";
    parentTicketId: string;
    columnId: string;
  }>({
    title: "",
    description: "",
    label: "backend",
    fixVersion: releaseVersions[0]?.name ?? "v1.0.0",
    storyPoints: 3 as 1 | 2 | 3 | 5 | 8 | 13,
    hierarchyType: "task",
    priority: "medium",
    parentTicketId: "",
    columnId: columnsForBoard[0]?.id ?? "",
  });

  useEffect(() => {
    if (columnsForBoard[0] && !columnsForBoard.find((item) => item.id === form.columnId)) {
      setForm((prev) => ({ ...prev, columnId: columnsForBoard[0].id }));
    }
  }, [columnsForBoard, form.columnId]);

  if (!createModalOpen) return null;

  const chosenColumn = columnsForBoard.find((item) => item.id === form.columnId);

  return (
    <div
      onClick={closeModal}
      className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-6"
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!activeBoardId || !form.columnId || !form.title.trim()) return;
          createTicket({
            boardId: activeBoardId,
            columnId: form.columnId,
            hierarchyType: form.hierarchyType,
            parentTicketId: form.parentTicketId || null,
            title: form.title.trim(),
            description: form.description.trim(),
            label: form.label.trim(),
            fixVersion: form.fixVersion.trim(),
            workflowState: chosenColumn?.states[0] ?? "todo",
            priority: form.priority,
            storyPoints: form.storyPoints,
          });
          setForm((prev) => ({ ...prev, title: "", description: "" }));
        }}
        className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-zinc-100">Create ticket</h2>
        <div className="mt-4 grid gap-3">
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
            placeholder="Description"
            className="min-h-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Label"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
            <div className="flex gap-2">
              <select
                value={form.fixVersion}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fixVersion: event.target.value }))
                }
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                {releaseVersions.map((version) => (
                  <option key={version.id} value={version.name}>
                    {version.name} · {version.releaseDate}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={openCreateVersion}
                className="rounded-md border border-indigo-400/40 px-2 py-2 text-indigo-200"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <select
              value={form.hierarchyType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  hierarchyType: event.target.value as "epic" | "story" | "task",
                }))
              }
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="epic">Epic</option>
              <option value="story">Story</option>
              <option value="task">Task</option>
            </select>
            <select
              value={form.priority}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  priority: event.target.value as "low" | "medium" | "high",
                }))
              }
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select
              value={form.storyPoints}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  storyPoints: Number(event.target.value) as 1 | 2 | 3 | 5 | 8 | 13,
                }))
              }
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              {[1, 2, 3, 5, 8, 13].map((points) => (
                <option key={points} value={points}>
                  {points} SP
                </option>
              ))}
            </select>
            <select
              value={form.columnId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, columnId: event.target.value }))
              }
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              {columnsForBoard.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-indigo-400 px-4 py-2 text-xs font-semibold text-zinc-950"
            >
              Create
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function CreateVersionModal() {
  const { createVersionModalOpen, closeModal, createVersion, selectedTicket } = useBoardContext();
  const [name, setName] = useState("");
  const [releaseDate, setReleaseDate] = useState("");

  if (!createVersionModalOpen) return null;

  return (
    <div
      onClick={closeModal}
      className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-6"
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          createVersion(name, releaseDate, selectedTicket?.id);
          setName("");
          setReleaseDate("");
        }}
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-zinc-100">Create Fix Version</h2>
        <div className="mt-4 grid gap-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Version (e.g. v1.4.0)"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
          <input
            type="date"
            value={releaseDate}
            onChange={(event) => setReleaseDate(event.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-indigo-400 px-4 py-2 text-xs font-semibold text-zinc-950"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function OrchestratorModal() {
  const {
    orchestratorOpen,
    closeModal,
    dispatchOrchestratorEvent,
  } = useBoardContext();

  if (!orchestratorOpen) return null;

  return (
    <div
      onClick={closeModal}
      className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-indigo-500/30 bg-zinc-900 p-6"
      >
        <h2 className="text-xl font-semibold text-zinc-100">AI Orchestrator</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Quick simulation controls while we prepare LangGraph integration.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() =>
              dispatchOrchestratorEvent({
                type: "START_ANALYSIS",
                requirement: "Split quarterly roadmap into executable slices.",
              })
            }
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
          >
            Start Analysis
          </button>
          <button
            onClick={() =>
              dispatchOrchestratorEvent({
                type: "ANALYSIS_COMPLETED",
                refinementDraft: "Edge cases expanded with technical caveats.",
                planDraft: "Ticket decomposition by role and sprint capacity.",
                suggestion: {
                  id: "s-2",
                  summary: "De-scope low-value scope to protect deadline.",
                  riskLevel: "high",
                  suggestedAction: "deScope",
                },
              })
            }
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
          >
            Complete Analysis
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchModal() {
  const { activeModal, allTickets, closeModal, openTicket } = useBoardContext();
  const [query, setQuery] = useState("");

  if (activeModal !== "search") return null;

  const trimmedQuery = query.trim();
  const suggestions = allTickets
    .map((ticket) => {
      const hay = `${ticket.ticketNumber} ${ticket.title} ${ticket.description} ${ticket.label} ${ticket.fixVersion} ${ticket.workflowState}`;
      return { ticket, score: fuzzyScore(trimmedQuery, hay) };
    })
    .filter((item) => trimmedQuery.length > 0 && item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return (
    <div
      onClick={closeModal}
      className="absolute inset-0 z-30 flex items-start justify-center bg-zinc-950/25 pt-16"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-indigo-500/30 bg-zinc-900 p-4 shadow-2xl"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by number, title, label, version, or state"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-100"
          />
        </div>
        {trimmedQuery.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            Type to search tickets by number, title, labels, version, or state.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {suggestions.map(({ ticket }) => (
              <button
                key={ticket.id}
                onClick={() => {
                  openTicket(ticket.id);
                  setQuery("");
                }}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-left hover:border-indigo-400/40"
              >
                <p className="text-xs font-semibold text-indigo-200">{ticket.ticketNumber}</p>
                <p className="text-sm font-semibold text-zinc-100">{ticket.title}</p>
                <p className="text-xs text-zinc-500">{ticket.label} · {ticket.fixVersion} · {ticket.workflowState}</p>
              </button>
            ))}
            {!suggestions.length && (
              <p className="text-xs text-zinc-500">No matching tickets.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MainLayout
 * @description The structural wrapper for Orion. Manages sidebar state.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BoardProvider>
      <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30">
        {/* Sidebar - Animated presence for smooth entry/exit */}
        <AnimatePresence mode="wait">
          {isSidebarOpen && <Sidebar key="sidebar" />}
        </AnimatePresence>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Topbar - Always visible */}
          <Topbar
            onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
            isSidebarOpen={isSidebarOpen}
          />

          <motion.main
            layout
            className="flex-1 overflow-y-auto bg-zinc-900/50 p-6 relative"
          >
            {children}
            <TicketModalOverlay />
            <CreateTicketModal />
            <CreateVersionModal />
            <OrchestratorModal />
            <SearchModal />
          </motion.main>
        </div>
      </div>
    </BoardProvider>
  );
}
