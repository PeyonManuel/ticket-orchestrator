import React from "react";
import { LayoutGrid } from "lucide-react";
import MainLayout from "@/MainLayout";

export default function HomePage() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 text-zinc-500 animate-in fade-in duration-700">
      <MainLayout>
        <div className="text-center">
          <h3 className="text-zinc-300 font-medium">Nothing is selected</h3>
          <p className="text-sm">
            Please select a board from the sidebar to start orchestrating.
          </p>
        </div>
      </MainLayout>
    </div>
  );
}
