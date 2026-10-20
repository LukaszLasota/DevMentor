import { Button } from "@devmentor/ui";

export default function AdminDashboard() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-muted-foreground">Admin panel — built with shadcn/ui.</p>
      <div className="flex gap-3">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
      </div>
    </main>
  );
}
