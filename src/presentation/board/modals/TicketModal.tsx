"use client";

import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Link2, MessageSquare, Plus, X } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "@apollo/client/react";
import { useBoardContext } from "@/presentation/board/BoardContext";
import { LabelDropdown } from "@/presentation/shared/dropdowns/LabelDropdown";
import { SimpleDropdown } from "@/presentation/shared/dropdowns/SimpleDropdown";
import { WorkflowDropdown } from "@/presentation/shared/dropdowns/WorkflowDropdown";
import {
  GET_TICKET_COMMENTS,
  GET_TICKET_HISTORY,
  ADD_COMMENT,
} from "@/infrastructure/graphql/operations";
import type { Comment, TicketHistoryEntry } from "@/domain/analyst";

interface CommentsQueryResult {
  ticket: { id: string; comments: Comment[] } | null;
}
interface HistoryQueryResult {
  ticketHistory: TicketHistoryEntry[];
}

export function TicketModal() {
  const {
    selectedTicket,
    allTickets,
    linkedTickets,
    conflictError,
    closeModal,
    openTicket,
    updateTicketField,
    updateTicketWorkflowState,
    updateTicketStoryPoints,
    updateTicketPriority,
    setTicketAssignee,
    orgMembers,
    boardColumns,
    linkTickets,
    unlinkTickets,
    openCreateTicketLinkedTo,
    workflowChoicesOrdered,
    releaseVersions,
    getTicketShareUrl,
    labels,
    addLabel,
    resolveConflict,
  } = useBoardContext();
  const { user } = useUser();

  const [editingField, setEditingField] = useState<"title" | "description" | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [showLinkComposer, setShowLinkComposer] = useState(false);
  const [hoverLinkedTicketId, setHoverLinkedTicketId] = useState<string | null>(null);
  const [lastTicketId, setLastTicketId] = useState(selectedTicket?.id);
  const [activityTab, setActivityTab] = useState<"comments" | "history">("comments");
  const [commentDraft, setCommentDraft] = useState("");
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const commentsQuery = useQuery<CommentsQueryResult>(GET_TICKET_COMMENTS, {
    variables: { ticketId: selectedTicket?.id ?? "" },
    skip: !selectedTicket,
  });
  const historyQuery = useQuery<HistoryQueryResult>(GET_TICKET_HISTORY, {
    variables: { ticketId: selectedTicket?.id ?? "" },
    skip: !selectedTicket || activityTab !== "history",
    // Surface freshly-recorded entries without forcing the user to reopen the modal.
    fetchPolicy: "cache-and-network",
  });
  const [addCommentMutation, { loading: addingComment }] = useMutation(ADD_COMMENT, {
    refetchQueries: [
      {
        query: GET_TICKET_COMMENTS,
        variables: { ticketId: selectedTicket?.id ?? "" },
      },
    ],
  });

  const comments: Comment[] = commentsQuery.data?.ticket?.comments ?? [];
  const history: TicketHistoryEntry[] = historyQuery.data?.ticketHistory ?? [];

  // Reset local UI state when ticket changes (React "adjust during render" pattern)
  if (selectedTicket?.id !== lastTicketId) {
    setLastTicketId(selectedTicket?.id);
    setLinkTargetId("");
    setEditingField(null);
    setShowLinkComposer(false);
    setCommentDraft("");
    setActivityTab("comments");
  }

  if (!selectedTicket) return null;

  // Maps a raw history value to something human-readable.
  // - assignee field: userId → member full name
  // - columnId field: column UUID → column name
  // - workflowState: camelCase slug → spaced label
  // - everything else: pass through
  const resolveHistoryValue = (field: string, raw: string | null): string => {
    if (raw === null || raw === "") return "—";
    if (field === "assignee") {
      const member = orgMembers.find((m) => m.userId === raw);
      return member?.fullName ?? raw;
    }
    if (field === "columnId") {
      const col = boardColumns.find((c) => c.id === raw);
      return col?.name ?? raw;
    }
    if (field === "workflowState") {
      return raw.replace(/([A-Z])/g, " $1").trim();
    }
    return raw;
  };

  const resolveActorName = (actorId: string): string => {
    if (actorId === user?.id) return "You";
    const member = orgMembers.find((m) => m.userId === actorId);
    return member?.fullName ?? actorId.slice(0, 8);
  };

  const submitComment = async () => {
    const body = commentDraft.trim();
    if (!body || addingComment) return;
    await addCommentMutation({
      variables: { ticketId: selectedTicket.id, body },
    });
    setCommentDraft("");
    commentInputRef.current?.focus();
  };

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
          className={`${className} cursor-text hover:text-zinc-700 dark:hover:text-zinc-100`}
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
          className="min-h-24 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200"
        />
      );
    }
    return (
      <input
        autoFocus
        value={value}
        onChange={(event) => updateTicketField(selectedTicket.id, field, event.target.value)}
        onBlur={() => setEditingField(null)}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200"
      />
    );
  };

  return (
    <motion.div
      key={selectedTicket.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={closeModal}
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50 dark:bg-zinc-950/70 backdrop-blur-sm sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-5xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-2xl"
      >
        {/* Conflict resolution banner */}
        {conflictError && conflictError.ticketId === selectedTicket.id && (
          <div className="mb-4 rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/40 p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
              Edit conflict
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              {conflictError.message} The following field{conflictError.conflictedFields.length !== 1 ? "s were" : " was"} changed by someone else:
            </p>
            <ul className="mb-3 space-y-1">
              {conflictError.conflictedFields.map((field) => {
                const serverVal = (conflictError.currentState as unknown as Record<string, unknown>)[field];
                const yourVal = conflictError.pendingPatch[field];
                return (
                  <li key={field} className="text-xs text-amber-700 dark:text-amber-400">
                    <span className="font-medium capitalize">{field}</span>:{" "}
                    <span className="line-through text-amber-500/70">{String(yourVal ?? "—")}</span>
                    {" → "}
                    <span className="font-medium text-amber-900 dark:text-amber-200">{String(serverVal ?? "—")}</span>
                    {" (server)"}
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => resolveConflict("overwrite")}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500 transition-colors"
              >
                Overwrite with my change
              </button>
              <button
                onClick={() => resolveConflict("discard")}
                className="rounded-md border border-amber-400/60 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              >
                Discard my change
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              {renderEditableField("title", "text-2xl font-semibold text-zinc-900 dark:text-zinc-50")}
              <button
                onClick={copyShareLink}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
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
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Close
          </button>
        </div>

        {/* 2-col body: description | metadata (assignee folded into metadata as a compact dropdown) */}
        <div className="grid gap-4 lg:grid-cols-[1fr_0.75fr]">
          {/* Description */}
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Description</p>
            {renderEditableField("description", "text-sm leading-relaxed text-zinc-700 dark:text-zinc-300")}
          </div>

          {/* Metadata */}
          <aside className="grid gap-3 content-start">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-3">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">Label</p>
              <LabelDropdown
                value={selectedTicket.label}
                labels={labels}
                onChange={(newLabel) => updateTicketField(selectedTicket.id, "label", newLabel)}
                onAddLabel={addLabel}
              />
            </div>

            <div className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400 font-semibold">
              Assignee
              <SimpleDropdown
                value={selectedTicket.assigneeIds[0] ?? ""}
                placeholder={orgMembers.length === 0 ? "No teammates yet" : "Unassigned"}
                options={[
                  { label: "Unassigned", value: "" },
                  ...orgMembers.map((m) => ({
                    label: m.fullName,
                    value: m.userId,
                    meta: m.userId === user?.id ? "you" : undefined,
                  })),
                ]}
                onChange={(v) => setTicketAssignee(selectedTicket.id, v || null)}
              />
            </div>

            <div className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400 font-semibold">
              Priority
              <SimpleDropdown
                value={selectedTicket.priority}
                options={[
                  { label: "Low", value: "low", dot: "#22c55e" },
                  { label: "Medium", value: "medium", dot: "#f59e0b" },
                  { label: "High", value: "high", dot: "#ef4444" },
                ]}
                onChange={(v) =>
                  updateTicketPriority(selectedTicket.id, v as "low" | "medium" | "high")
                }
              />
            </div>

            <div className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400 font-semibold">
              Workflow
              <WorkflowDropdown
                selectedState={selectedTicket.workflowState}
                choices={workflowChoicesOrdered}
                onSelect={(state) => updateTicketWorkflowState(selectedTicket.id, state)}
              />
            </div>

            <div className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400 font-semibold">
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

            <div className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400 font-semibold">
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

        {/* Linked tickets */}
        <section className="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Linked</h3>
            <button
              onClick={() => setShowLinkComposer((prev) => !prev)}
              className="rounded-md border border-indigo-400/40 p-1 text-indigo-600 dark:text-indigo-200"
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
                className="inline-flex items-center gap-1 rounded-md border border-indigo-400/30 px-2 py-1 text-xs text-indigo-600 dark:text-indigo-200"
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
                    className="text-zinc-400 dark:text-zinc-300 hover:text-rose-500 dark:hover:text-rose-300"
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
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
              >
                Create linked ticket
              </button>
            </div>
          )}
        </section>

        {/* Activity: Comments | History */}
        <section className="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-3">
          {/* Tab bar */}
          <div className="mb-3 flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-2">
            <button
              onClick={() => setActivityTab("comments")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                activityTab === "comments"
                  ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <MessageSquare size={12} />
              Comments {comments.length > 0 && <span className="text-zinc-400">({comments.length})</span>}
            </button>
            <button
              onClick={() => setActivityTab("history")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                activityTab === "history"
                  ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <Clock size={12} />
              History
            </button>
          </div>

          {/* Comments panel */}
          {activityTab === "comments" && (
            <div className="flex flex-col gap-3">
              {/* Existing comments */}
              {commentsQuery.loading && comments.length === 0 && (
                <p className="text-xs text-zinc-500">Loading comments…</p>
              )}
              {comments.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {comments.map((c) => {
                    const isMine = c.authorId === user?.id;
                    const displayName = isMine
                      ? (user?.fullName ?? user?.username ?? "You")
                      : c.authorId.slice(0, 8);
                    return (
                      <li key={c.id} className="flex gap-2.5">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white uppercase">
                          {displayName.slice(0, 2)}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{displayName}</span>
                            <span className="text-[10px] text-zinc-500">
                              {new Date(c.createdAt).toLocaleString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "short",
                              })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{c.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Composer */}
              <div className="flex gap-2.5">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase">
                  {user ? (user.fullName ?? user.username ?? "?").slice(0, 2) : "?"}
                </span>
                <div className="flex-1">
                  <textarea
                    ref={commentInputRef}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitComment();
                    }}
                    placeholder="Add a comment… (⌘+Enter to submit)"
                    rows={2}
                    className="w-full resize-none rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                  />
                  <div className="mt-1 flex justify-end">
                    <button
                      onClick={submitComment}
                      disabled={!commentDraft.trim() || addingComment}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {addingComment ? "Posting…" : "Comment"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* History panel */}
          {activityTab === "history" && (
            <div className="flex flex-col gap-2 text-xs text-zinc-500">
              {historyQuery.loading && history.length === 0 && (
                <p className="text-zinc-400 dark:text-zinc-600 text-[11px]">Loading history…</p>
              )}
              {history.length === 0 && !historyQuery.loading && (
                <p className="text-zinc-400 dark:text-zinc-600 text-[11px]">No activity yet.</p>
              )}
              {history.map((entry) => {
                const actorLabel = resolveActorName(entry.actorId);
                return (
                  <div key={entry.id} className="flex items-start gap-2 py-1">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-[9px] font-bold text-zinc-600 dark:text-zinc-300 uppercase">
                      {actorLabel.slice(0, 2)}
                    </span>
                    <div className="flex-1">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{actorLabel}</span>
                        {entry.kind === "created" && " created the ticket"}
                        {entry.kind === "commented" && " added a comment"}
                        {entry.kind === "comment_edited" && " edited a comment"}
                        {entry.kind === "comment_deleted" && " deleted a comment"}
                        {entry.kind === "assignee_added" && " assigned "}
                        {entry.kind === "assignee_removed" && " unassigned "}
                        {entry.kind === "updated" && " updated"}
                        {(entry.kind === "assignee_added" || entry.kind === "assignee_removed") &&
                          entry.changes[0] && (
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                              {resolveHistoryValue(
                                "assignee",
                                entry.kind === "assignee_added"
                                  ? entry.changes[0].to
                                  : entry.changes[0].from,
                              )}
                            </span>
                          )}
                      </span>
                      {entry.kind === "updated" && entry.changes.length > 0 && (
                        <ul className="mt-0.5 ml-2 list-disc text-[11px] text-zinc-500">
                          {entry.changes.map((ch, idx) => (
                            <li key={idx}>
                              <span className="font-medium capitalize">
                                {ch.field === "columnId" ? "column" :
                                 ch.field === "workflowState" ? "status" :
                                 ch.field === "fixVersion" ? "version" :
                                 ch.field === "storyPoints" ? "points" :
                                 ch.field}
                              </span>
                              {": "}
                              <span className="line-through text-zinc-400">
                                {resolveHistoryValue(ch.field, ch.from)}
                              </span>
                              {" → "}
                              <span className="text-zinc-700 dark:text-zinc-300">
                                {resolveHistoryValue(ch.field, ch.to)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span className="text-zinc-400 dark:text-zinc-600 text-[10px] shrink-0">
                      {new Date(entry.timestamp).toLocaleString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </motion.div>
    </motion.div>
  );
}
