import React from "react";
import MainLayout from "@/MainLayout";
import BoardWorkspaceView from "@/BoardWorkspaceView";

export default function HomePage() {
  return (
    <div className="h-full w-full animate-in fade-in duration-700">
      <MainLayout>
        <BoardWorkspaceView />
      </MainLayout>
    </div>
  );
}
