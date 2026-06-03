"use client";

import * as React from "react";
import { Printer } from "lucide-react";

export function PrintTrigger() {
  React.useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <button
      onClick={() => window.print()}
      className="no-print fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#1B4332] px-5 py-3 text-sm font-medium text-white shadow-lg hover:opacity-90"
    >
      <Printer className="h-4 w-4" />
      Imprimir / Guardar PDF
    </button>
  );
}
