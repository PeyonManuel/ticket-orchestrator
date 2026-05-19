"use client";

import { CopyButton } from "./CopyButton";

interface UserBubbleProps {
  text: string;
  className?: string;
}

export function UserBubble({ text, className = "" }: UserBubbleProps) {
  return (
    <div className={`group relative max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-indigo-500 text-white ${className}`}>
      <div className="pr-8">
        {text}
      </div>
      <div className="absolute top-2 right-2">
        <CopyButton text={text} className="text-white hover:text-gray-100" />
      </div>
    </div>
  );
}
