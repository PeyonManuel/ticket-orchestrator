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
import { useEffect, useRef } from "react";

/**
 * Rich markdown editor backed by MDXEditor. Stores/emits plain markdown so the
 * DB stays clean and the AI can read descriptions as text.
 *
 * Visual markdown: typing `# `, `- `, `**bold**` renders instantly via
 * markdownShortcutPlugin. Toolbar mirrors that for users who prefer buttons.
 */
export function RichMarkdownEditor({
  value,
  onChange,
  className,
  aiTouched = false,
}: {
  value: string;
  onChange: (markdown: string) => void;
  className?: string;
  /** When true, pulses a yellow "ghost diff" highlight for ~3s to flag an AI edit. */
  aiTouched?: boolean;
}) {
  const editorRef = useRef<MDXEditorMethods>(null);

  // MDXEditor caches its document on mount; pushing a new `value` (e.g. AI
  // mutation applied to the underlying ticket) needs an imperative setMarkdown
  // call or the editor stays stuck on the prior text.
  useEffect(() => {
    const current = editorRef.current?.getMarkdown();
    if (current !== undefined && current !== value) {
      editorRef.current?.setMarkdown(value);
    }
  }, [value]);

  return (
    <div
      className={`flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 ${
        aiTouched ? "ai-touched-glow" : ""
      } ${className ?? ""}`}
    >
      <MDXEditor
        ref={editorRef}
        markdown={value}
        onChange={onChange}
        placeholder="Write description and acceptance criteria here. Try # heading, **bold**, - bullet, > quote…"
        contentEditableClassName="orion-mdx-content"
        className="orion-mdx-editor flex-1 min-h-0 overflow-y-auto"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
          codeMirrorPlugin({ codeBlockLanguages: { "": "Plain", js: "JavaScript", ts: "TypeScript" } }),
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
        ]}
      />
    </div>
  );
}
