"use client";

import React, { useState } from "react";
import { Check, Link2, Plus, X } from "lucide-react";
import { useBoardContext } from "@/presentation/board/BoardContext";
import { LabelDropdown } from "@/presentation/shared/dropdowns/LabelDropdown";
import { SimpleDropdown } from "@/presentation/shared/dropdowns/SimpleDropdown";
import { WorkflowDropdown } from "@/presentation/shared/dropdowns/WorkflowDropdown";

export function TicketModal() {
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
    workflowChoicesOrdered,
    releaseVersions,
    getTicketShareUrl,
    labels,
    addLabel,
  } = useBoardContext();
  const [editingField, setEditingField] = useState<"title" | "description" | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [showLinkComposer, setShowLinkComposer] = useState(false);
  const [hoverLinkedTicketId, setHoverLinkedTicketId] = useState<string | null>(null);
  const [lastTicketId, setLastTicketId] = useState(selectedTicket?.id);

  // Reset local UI state when ticket changes (React "adjust during render" pattern)
  if (selectedTicket?.id !== lastTicketId) {
    setLastTicketId(selectedTicket?.id);
    setLinkTargetId("");
    setEditingField(null);
    setShowLinkComposer(false);
  }

  if (!selectedTicket) return null;

  const copyShareLink = async () => {
    const url = getTicketShareUrl(selectedTicket.id);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1200);
  };

  const renderEditableField = (field: "title" | "description", className: string) => {
    const value = selectedTicket[field];
    if (editingField !== field) {
      const Tag = field === "title" ? "h1" : "p";
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
        onChange={(event) => updateTicketField(selectedTicket.id, field, event.target.value)}
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
              <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">Label</p>
              <LabelDropdown
                value={selectedTicket.label}
                labels={labels}
                onChange={(newLabel) => updateTicketField(selectedTicket.id, "label", newLabel)}
                onAddLabel={addLabel}
              />
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
              <WorkflowDropdown
                selectedState={selectedTicket.workflowState}
                choices={workflowChoicesOrdered}
                onSelect={(state) => updateTicketWorkflowState(selectedTicket.id, state)}
              />
              <p className="text-[11px] text-zinc-500">
                Selecting a state automatically moves the ticket to its mapped column.
              </p>
            </div>

            <div className="grid gap-1 text-xs text-zinc-400 font-semibold">
              Story Points
              <SimpleDropdown
                value={String(selectedTicket.storyPoints)}
                options={[1, 2, 3, 5, 8, 13].map((p) => ({
                  label: `${p} SP`,
                  value: String(p),
                }))}
                onChange={(v) =>
                  updateTicketStoryPoints(selectedTicket.id, Number(v) as 1 | 2 | 3 | 5 | 8 | 13)
                }
              />
            </div>

            <div className="grid gap-1 text-xs text-zinc-400 font-semibold">
              Fix Version
              <SimpleDropdown
                value={selectedTicket.fixVersion}
                options={releaseVersions.map((v) => ({
                  label: v.name,
                  value: v.name,
                  meta: v.releaseDate,
                }))}
                onChange={(v) => updateTicketField(selectedTicket.id, "fixVersion", v)}
              />
            </div>
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
                <button
                  onClick={() => openTicket(ticket.id)}
                  className="underline underline-offset-2"
                >
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
              <SimpleDropdown
                className="min-w-56 flex-1"
                value={linkTargetId}
                placeholder="Search ticket to link"
                options={allTickets
                  .filter((ticket) => ticket.id !== selectedTicket.id)
                  .map((ticket) => ({
                    value: ticket.id,
                    label: `${ticket.ticketNumber} · ${ticket.title}`,
                  }))}
                onChange={(v) => setLinkTargetId(v)}
              />
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
