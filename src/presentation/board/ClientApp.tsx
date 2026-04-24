"use client";

import dynamic from "next/dynamic";

// `ssr: false` requires a Client Component boundary — board uses localStorage.
const MainLayout = dynamic(
  () => import("@/presentation/board/layout/MainLayout"),
  { ssr: false },
);

const BoardWorkspaceView = dynamic(
  () => import("@/presentation/board/workspace/BoardWorkspaceView"),
  { ssr: false },
);

export default function ClientApp() {
  return (
    <MainLayout>
      <BoardWorkspaceView />
    </MainLayout>
  );
}
