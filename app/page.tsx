import React from "react";
import MainLayout from "@/presentation/board/layout/MainLayout";
import BoardWorkspaceView from "@/presentation/board/workspace/BoardWorkspaceView";

export default function HomePage() {
  return (
    <div className="h-full w-full animate-in fade-in duration-700">
      <MainLayout>
        <BoardWorkspaceView />
      </MainLayout>
    </div>
  );
}
