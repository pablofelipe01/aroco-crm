import { Wordmark } from "@/components/brand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Cacao gradient ambience */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-accent-soft blur-3xl opacity-60" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent-soft blur-3xl opacity-40" />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-fg-subtle">
          Plataforma interna de AROCO S.A.S
        </p>
      </div>
    </div>
  );
}
