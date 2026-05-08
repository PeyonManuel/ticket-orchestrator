"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users } from "lucide-react";
import { useBoardActions, useBoardData } from "@/presentation/board/BoardContext";
import type { OrgMemberRole } from "@/domain/analyst";

const ROLES: { value: OrgMemberRole; label: string }[] = [
  { value: "po", label: "Product Owner" },
  { value: "ux", label: "UX Designer" },
  { value: "developer", label: "Developer" },
  { value: "tester", label: "Tester" },
];

const ROLE_BADGE: Record<OrgMemberRole, string> = {
  po: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  ux: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  developer: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  tester: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

function roleBadgeClass(role: OrgMemberRole | null | undefined): string {
  if (!role) return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  return ROLE_BADGE[role];
}

function roleLabel(role: OrgMemberRole | null | undefined): string {
  if (!role) return "No role";
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

export function MembersModal() {
  const { activeModal, orgMembers } = useBoardData();
  const { closeModal, setMemberRole } = useBoardActions();
  const [saving, setSaving] = useState<string | null>(null);

  const isOpen = activeModal === "members";

  const handleRoleChange = async (userId: string, role: OrgMemberRole | null) => {
    setSaving(userId);
    try {
      await setMemberRole(userId, role);
    } finally {
      setSaving(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="members-backdrop"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeModal}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="members-panel"
              className="pointer-events-auto w-full max-w-lg rounded-xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[80vh]"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Users size={15} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Team Members
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {orgMembers.length} member{orgMembers.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  aria-label="Close"
                  className="h-7 w-7 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Member list */}
              <div className="overflow-y-auto flex-1">
                {orgMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-600 gap-2">
                    <Users size={24} />
                    <p className="text-sm">No members found</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {orgMembers.map((member) => (
                      <li
                        key={member.userId}
                        className="flex items-center gap-3 px-5 py-3.5"
                      >
                        {/* Avatar */}
                        {member.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={member.imageUrl}
                            alt={member.fullName ?? ""}
                            className="h-8 w-8 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0 flex items-center justify-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                            {(member.fullName ?? member.emailAddress ?? "?")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}

                        {/* Name + email */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {member.fullName ?? member.emailAddress}
                          </p>
                          {member.fullName && member.emailAddress && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              {member.emailAddress}
                            </p>
                          )}
                        </div>

                        {/* Role selector */}
                        <div className="shrink-0 flex items-center gap-2">
                          {saving === member.userId ? (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                              Saving…
                            </span>
                          ) : (
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadgeClass(member.role)}`}
                            >
                              {roleLabel(member.role)}
                            </span>
                          )}
                          <RoleDropdown
                            current={member.role ?? null}
                            disabled={saving === member.userId}
                            onChange={(role) => handleRoleChange(member.userId, role)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function RoleDropdown({
  current,
  disabled,
  onChange,
}: {
  current: OrgMemberRole | null;
  disabled: boolean;
  onChange: (role: OrgMemberRole | null) => void;
}) {
  return (
    <select
      disabled={disabled}
      value={current ?? ""}
      onChange={(e) => onChange((e.target.value as OrgMemberRole) || null)}
      className="text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors disabled:opacity-50 cursor-pointer"
    >
      <option value="">No role</option>
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}
