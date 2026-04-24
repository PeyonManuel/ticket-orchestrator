"use client";

import dynamic from "next/dynamic";

// Single dynamic import avoids a loading waterfall. `ssr: false` is required
// because the board hydrates state from localStorage.
const BoardApp = dynamic(() => import("./BoardApp"), { ssr: false });

export default function ClientApp() {
  return <BoardApp />;
}
