"use client";

interface Props {
  message: string;
  onRetry: () => void;
}

export function ErrorMessage({ message, onRetry }: Props) {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-lg px-3 py-2.5 max-w-[80%]">
        <span className="text-rose-500 dark:text-rose-400 flex-shrink-0 mt-0.5">⚠</span>
        <span className="flex-1">{message || "Something went wrong."}</span>
        <button
          onClick={onRetry}
          className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium flex-shrink-0 whitespace-nowrap ml-2"
        >
          Retry ↺
        </button>
      </div>
    </div>
  );
}
