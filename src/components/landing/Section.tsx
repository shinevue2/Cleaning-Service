import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export interface SectionProps {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** centre the heading block */
  center?: boolean;
}

/** A landing-page section with a consistent heading block and spacing. */
export function Section({ id, eyebrow, title, description, children, className, center = false }: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("py-16 sm:py-20 lg:py-24", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
          {eyebrow && (
            <p className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold tracking-wide text-brand-700">
              <span aria-hidden className="h-px w-6 bg-brand-500" />
              {eyebrow}
            </p>
          )}
          <h2 id={headingId} className="text-2xl font-bold leading-snug text-slate-900 text-balance sm:text-3xl">
            {title}
          </h2>
          {description && <p className="mt-4 text-[15px] leading-relaxed text-slate-600 sm:text-base">{description}</p>}
        </div>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  );
}
