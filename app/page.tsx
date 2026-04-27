import ClientApp from "@/presentation/board/ClientApp";
import { AuthGuard } from "./AuthGuard";

export default function HomePage() {
  return (
    <AuthGuard>
      <div className="h-full w-full animate-in fade-in duration-700">
        <ClientApp />
      </div>
    </AuthGuard>
  );
}
