import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";

/** Shape of an icon component such as lucide-react's `Send`. */
export type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/**
 * An icon prop accepts either a lucide-react component (`icon={Send}`) or an
 * already-rendered element (`icon={<Send className="size-4" />}`).
 *
 * Note: when passing an icon from a Server Component into a Client Component, pass an
 * element (`<Send />`), not the component — functions cannot cross that boundary.
 * The hook-free UI parts (Button, Badge, Card, EmptyState, PageHeader …) are server-safe,
 * so either form works there.
 */
export type IconLike = IconComponent | ReactNode;

function isComponent(value: IconLike): value is IconComponent {
  if (typeof value === "function") return true;
  // forwardRef / memo components (lucide icons) are objects tagged with $$typeof
  return typeof value === "object" && value !== null && "$$typeof" in value && !isValidElement(value);
}

/** Renders an IconLike with the given class; elements are returned untouched. */
export function renderIcon(icon: IconLike | undefined, className: string): ReactNode {
  if (icon === undefined || icon === null || icon === false) return null;
  if (isComponent(icon)) return createElement(icon, { className, "aria-hidden": true });
  return icon;
}
