import { HealthPanel } from "./HealthPanel";

export default function AdminPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted-foreground">System status.</p>
      </div>
      <HealthPanel />
    </main>
  );
}
