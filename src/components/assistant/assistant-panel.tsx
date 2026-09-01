"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles, Send, Loader2, Wrench } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { TarjetaPropuesta } from "./propuesta";
import type { AgentProposal } from "./actions";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: { name: string }[];
  proposals?: AgentProposal[];
}

interface AssistantContextValue {
  open: () => void;
  close: () => void;
}

const Ctx = React.createContext<AssistantContextValue | null>(null);

export function useAssistant() {
  const ctx = React.useContext(Ctx);
  if (!ctx)
    throw new Error("useAssistant must be used within <AssistantProvider>");
  return ctx;
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const sugerencias = [
    t.asistente.sugerencia1,
    t.asistente.sugerencia2,
    t.asistente.sugerencia3,
    t.asistente.sugerencia4,
  ];
  const [isOpen, setIsOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const open = React.useCallback(() => setIsOpen(true), []);
  const close = React.useCallback(() => setIsOpen(false), []);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
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
          { role: "assistant", content: data.error ?? t.asistente.huboError },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.reply,
            tools: data.tools_used,
            proposals: Array.isArray(data.proposals) ? data.proposals : [],
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: t.asistente.sinConexion },
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
            <Sparkles className="text-accent h-4 w-4" />
            {t.asistente.titulo}
          </span>
        }
        subtitle={<span className="text-xs">{t.asistente.subtitulo}</span>}
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
              placeholder={t.asistente.placeholder}
              rows={1}
              className="min-h-10 flex-1 resize-none"
            />
            <Button
              type="submit"
              size="icon"
              loading={loading}
              disabled={!input.trim()}
            >
              {!loading && <Send className="h-4 w-4" />}
            </Button>
          </form>
        }
      >
        <div
          ref={scrollRef}
          className="flex h-full flex-col gap-3 overflow-y-auto"
        >
          {messages.length === 0 && !loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="bg-accent-soft text-accent-soft-fg flex h-12 w-12 items-center justify-center rounded-full">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="text-fg-muted max-w-xs text-sm">
                {t.asistente.invitacion}
              </p>
              <div className="flex flex-col gap-2">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="border-border bg-surface text-fg-muted hover:border-accent hover:text-fg rounded-[var(--radius-md)] border px-3 py-2 text-left text-xs transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <React.Fragment key={i}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[88%] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm",
                  m.role === "user"
                    ? "bg-accent text-accent-fg self-end"
                    : "border-border bg-surface text-fg self-start border",
                )}
              >
                <p className="leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </p>
                {m.tools && m.tools.length > 0 && (
                  <p className="text-fg-subtle mt-2 flex items-center gap-1 text-[10px]">
                    <Wrench className="h-3 w-3" />
                    {m.tools.map((t) => t.name).join(", ")}
                  </p>
                )}
              </motion.div>

              {m.proposals?.map((p, j) => (
                <TarjetaPropuesta key={`${i}:${j}`} propuesta={p} />
              ))}
            </React.Fragment>
          ))}

          {loading && (
            <div className="border-border bg-surface text-fg-muted flex items-center gap-2 self-start rounded-[var(--radius-md)] border px-3.5 py-2.5 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.asistente.consultando}
            </div>
          )}
        </div>
      </Drawer>
    </Ctx.Provider>
  );
}
