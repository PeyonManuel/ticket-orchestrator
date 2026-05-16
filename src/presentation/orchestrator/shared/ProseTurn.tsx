/**
 * Shared AI prose response component used across all orchestrator phases.
 * Renders AI replies with simple Markdown:
 *  - Double-newline → paragraph break
 *  - Lines starting with "- " → bullet list (grouped consecutively)
 *  - **text** → bold
 *
 * Kept minimal on purpose: AI chat output rarely needs more, and a full
 * markdown library (react-markdown + remark) costs ~80kb for marginal gain.
 */

import React from "react";

type Token =
  | { type: "text"; content: string }
  | { type: "bold"; content: string };

/**
 * Parse a single line for inline **bold** spans.
 * Anything not inside ** is plain text.
 */
function parseInline(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", content: line.slice(lastIndex, match.index) });
    }
    tokens.push({ type: "bold", content: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    tokens.push({ type: "text", content: line.slice(lastIndex) });
  }
  return tokens;
}

function renderInline(line: string, keyPrefix: string): React.ReactNode {
  const tokens = parseInline(line);
  return tokens.map((tok, i) =>
    tok.type === "bold" ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-zinc-900 dark:text-zinc-100">
        {tok.content}
      </strong>
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>{tok.content}</React.Fragment>
    ),
  );
}

/**
 * Split a paragraph into runs of bullet lines and prose lines so we can
 * render <ul> blocks and <p> blocks in their natural reading order.
 */
type Block =
  | { type: "list"; items: string[] }
  | { type: "para"; text: string };

function blocksOfParagraph(paragraph: string): Block[] {
  const lines = paragraph.split("\n");
  const blocks: Block[] = [];
  let proseBuf: string[] = [];
  let listBuf: string[] = [];

  const flushProse = () => {
    if (proseBuf.length) {
      blocks.push({ type: "para", text: proseBuf.join("\n") });
      proseBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length) {
      blocks.push({ type: "list", items: listBuf });
      listBuf = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushProse();
      listBuf.push(trimmed.slice(2));
    } else if (trimmed.length === 0) {
      // Blank line inside what we thought was one paragraph — keep flow.
      if (listBuf.length) flushList();
      else proseBuf.push("");
    } else {
      flushList();
      proseBuf.push(line);
    }
  }
  flushProse();
  flushList();
  return blocks;
}

export function ProseTurn({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div
      className={
        className ?? "text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 space-y-2 pr-2"
      }
    >
      {paragraphs.map((para, pi) => {
        const blocks = blocksOfParagraph(para);
        return (
          <div key={pi} className="space-y-1.5">
            {blocks.map((b, bi) =>
              b.type === "list" ? (
                <ul key={bi} className="list-disc list-outside pl-4 space-y-1">
                  {b.items.map((item, ii) => (
                    <li key={ii} className="whitespace-pre-wrap">
                      {renderInline(item, `${pi}-${bi}-${ii}`)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={bi} className="whitespace-pre-wrap">
                  {renderInline(b.text, `${pi}-${bi}`)}
                </p>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
