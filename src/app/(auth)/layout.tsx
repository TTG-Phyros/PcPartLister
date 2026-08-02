export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">PcPartLister</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Stock, configurations et rentabilité
        </p>
      </div>
      {children}
    </main>
  );
}
