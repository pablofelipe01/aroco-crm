import * as React from "react";
import { Hammer, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

export function ModulePlaceholder({
  title,
  description,
  phase,
  icon: Icon = Hammer,
  features,
}: {
  title: string;
  description: string;
  phase: string;
  icon?: LucideIcon;
  features?: string[];
}) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={<Badge tone="accent">{phase}</Badge>}
      />
      <EmptyState
        icon={<Icon className="h-6 w-6" />}
        title="Módulo en construcción"
        description={`Llega en la ${phase}. ${
          features?.length ? "Incluirá: " + features.join(" · ") : ""
        }`}
      />
    </div>
  );
}
