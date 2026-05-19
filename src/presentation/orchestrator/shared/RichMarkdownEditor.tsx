"use client";

import "@mdxeditor/editor/style.css";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect,
  CreateLink,
  linkPlugin,
  linkDialogPlugin,
  UndoRedo,
  Separator,
  codeBlockPlugin,
  codeMirrorPlugin,
} from "@mdxeditor/editor";
import { useCallback, useEffect, useMemo, useRef } from "react";

export function RichMarkdownEditor({
  value,
  onChange,
  className,
  aiTouched = false,
}: {
  value: string;
  onChange: (markdown: string) => void;
  className?: string;
  aiTouched?: boolean;
}) {
  const editorRef = useRef<MDXEditorMethods>(null);

  // Tracks the last markdown string the editor emitted — updated immediately
  // on every keystroke so the echo guard in the useEffect is always current.
  const lastEmittedRef = useRef<string>(value);
  // Pending debounce timer — non-null while the user is actively typing.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending value waiting to be flushed to the parent.
  const pendingRef = useRef<string | null>(null);
  // Always-current reference to the onChange prop so the stable handleChange
  // callback never captures a stale closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Only push the external value into the editor when it genuinely came from
  // outside (AI mutation, ticket navigation). Skip if the user is actively
  // typing (debounce pending) or if we already told the parent this value.
  useEffect(() => {
    if (debounceTimerRef.current) return; // user is typing — don't interrupt
    if (value !== lastEmittedRef.current) {
      editorRef.current?.setMarkdown(value);
      lastEmittedRef.current = value;
    }
  }, [value]);

  // Flush any pending change on unmount so a quick "approve & next" doesn't
  // silently drop the last few keystrokes.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        if (pendingRef.current !== null) {
          onChangeRef.current(pendingRef.current);
        }
      }
    };
  }, []);

  // Stable callback (no deps — uses only refs). Debounces the upward call so
  // XState / Apollo only update every ~400ms instead of on every keystroke.
  const handleChange = useCallback((markdown: string) => {
    lastEmittedRef.current = markdown;
    pendingRef.current = markdown;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      pendingRef.current = null;
      onChangeRef.current(markdown);
    }, 400);
  }, []);

  // Plugin instances are stable for the lifetime of the component. Recreating
  // them on every render causes MDXEditor to tear down and rebuild its entire
  // ProseMirror document, which is the primary source of typing lag.
  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
      codeMirrorPlugin({
        codeBlockLanguages: { "": "Plain", js: "JavaScript", ts: "TypeScript" },
      }),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <ListsToggle />
            <Separator />
            <CreateLink />
          </>
        ),
      }),
    ],
    [],
  );

  return (
    <div
      className={`flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 ${
        aiTouched ? "ai-touched-glow" : ""
      } ${className ?? ""}`}
    >
      <MDXEditor
        ref={editorRef}
        markdown={value}
        onChange={handleChange}
        placeholder="Write description and acceptance criteria here. Try # heading, **bold**, - bullet, > quote…"
        contentEditableClassName="orion-mdx-content"
        className="orion-mdx-editor flex-1 min-h-0 overflow-y-auto"
        plugins={plugins}
      />
    </div>
  );
}
