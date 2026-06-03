"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles, Send, Loader2, Wrench } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: { name: string }[];
}

interface AssistantContextValue {
  open: () => void;
  close: () => void;
}

const Ctx = React.createContext<AssistantContextValue | null>(null);

export function useAssistant() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAssistant must be used within <AssistantProvider>");
  return ctx;
}

const SUGGESTIONS = [
  "¿Qué leads internacionales están en negociación?",
  "¿Cuánto cacao queda disponible en bodega?",
  "¿Cuál es el precio actual de Casa Luker?",
  "¿Cómo va el pipeline comercial?",
];

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const open = React.useCallback(() => setIsOpen(true), []);
  const close = React.useCallback(() => setIsOpen(false), []);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.error ?? "Hubo un error." },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.reply, tools: data.tools_used },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "No se pudo conectar con el asistente." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      <Drawer
        open={isOpen}
        onClose={close}
        width="md"
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            Asistente AROCO
          </span>
        }
        subtitle={<span className="text-xs">Consulta tus datos en lenguaje natural · solo lectura</span>}
        footer={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex w-full items-end gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Pregunta sobre leads, inventario, precios…"
              rows={1}
              className="min-h-10 flex-1 resize-none"
            />
            <Button type="submit" size="icon" loading={loading} disabled={!input.trim()}>
              {!loading && <Send className="h-4 w-4" />}
            </Button>
          </form>
        }
      >
        <div ref={scrollRef} className="flex h-full flex-col gap-3 overflow-y-auto">
          {messages.length === 0 && !loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="max-w-xs text-sm text-fg-muted">
                Pregúntame sobre el pipeline, el inventario o los precios. Consulto
                los datos reales respetando tus permisos.
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "max-w-[88%] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm",
                m.role === "user"
                  ? "self-end bg-accent text-accent-fg"
                  : "self-start border border-border bg-surface text-fg",
              )}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              {m.tools && m.tools.length > 0 && (
                <p className="mt-2 flex items-center gap-1 text-[10px] text-fg-subtle">
                  <Wrench className="h-3 w-3" />
                  {m.tools.map((t) => t.name).join(", ")}
                </p>
              )}
            </motion.div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 self-start rounded-[var(--radius-md)] border border-border bg-surface px-3.5 py-2.5 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Consultando…
            </div>
          )}
        </div>
      </Drawer>
    </Ctx.Provider>
  );
}
