"use client";

import MainLayout from "./layout/MainLayout";
import BoardWorkspaceView from "./workspace/BoardWorkspaceView";

export default function BoardApp() {
  return (
    <MainLayout>
      <BoardWorkspaceView />
    </MainLayout>
  );
}
