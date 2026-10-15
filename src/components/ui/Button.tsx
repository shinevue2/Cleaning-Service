import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/format";
import { renderIcon, type IconLike } from "./icon";

/*
 * Buttons are hook-free and therefore usable from Server and Client Components alike.
 */

/** `inverse` = white outline button for dark/coloured backgrounds. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "line" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700",
  secondary:
    "bg-white text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 active:bg-slate-100",
  ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:bg-red-600",
  line: "bg-line-strong text-white shadow-sm hover:bg-line-deep active:bg-line-deep disabled:bg-line-strong",
  inverse: "bg-white/5 text-white ring-1 ring-inset ring-white/45 hover:bg-white/15 active:bg-white/20",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-xl px-6 text-[15px]",
};

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "size-3.5 shrink-0",
  md: "size-4 shrink-0",
  lg: "size-5 shrink-0",
};

const BASE =
  "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-colors duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** full width */
  block?: boolean;
  className?: string;
}

/** Class string for anything that should look like a button (e.g. a custom link). */
export function buttonClasses({ variant = "primary", size = "md", block, className }: ButtonStyleOptions = {}): string {
  return cn(BASE, VARIANT[variant], SIZE[size], block && "w-full", className);
}

interface ButtonContentProps {
  size: ButtonSize;
  icon?: IconLike;
  iconRight?: IconLike;
  loading?: boolean;
  children?: ReactNode;
}

function ButtonContent({ size, icon, iconRight, loading, children }: ButtonContentProps) {
  return (
    <>
      {loading ? (
        <LoaderCircle className={cn(ICON_SIZE[size], "animate-spin")} aria-hidden />
      ) : (
        renderIcon(icon, ICON_SIZE[size])
      )}
      {children !== undefined && children !== null && <span className="truncate">{children}</span>}
      {renderIcon(iconRight, ICON_SIZE[size])}
    </>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  /** leading icon (lucide component or element) */
  icon?: IconLike;
  /** trailing icon */
  iconRight?: IconLike;
  /** shows a spinner and disables the button */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "primary",
  size = "md",
  block,
  icon,
  iconRight,
  loading = false,
  className,
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      <ButtonContent size={size} icon={icon} iconRight={iconRight} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  );
}

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">,
    ButtonStyleOptions {
  href: string;
  icon?: IconLike;
  iconRight?: IconLike;
  /** open in a new tab with rel="noopener noreferrer" */
  external?: boolean;
  prefetch?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

/** A Next.js <Link> styled as a button. */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  block,
  icon,
  iconRight,
  external,
  prefetch,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = buttonClasses({ variant, size, block, className });
  const content = (
    <ButtonContent size={size} icon={icon} iconRight={iconRight}>
      {children}
    </ButtonContent>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetch} className={classes} {...rest}>
      {content}
    </Link>
  );
}

const ICON_BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "size-8 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-xl",
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name — also shown as a tooltip. Required. */
  label: string;
  icon: IconLike;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** visual-only badge count (e.g. unread); included in the accessible name */
  count?: number;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  count,
  className,
  type = "button",
  title,
  ...rest
}: IconButtonProps) {
  const hasCount = typeof count === "number" && count > 0;
  return (
    <button
      type={type}
      aria-label={hasCount ? `${label}（${count}件）` : label}
      title={title ?? label}
      className={cn(BASE, VARIANT[variant], ICON_BUTTON_SIZE[size], "relative shrink-0 p-0", className)}
      {...rest}
    >
      {renderIcon(icon, ICON_SIZE[size === "sm" ? "md" : "lg"])}
      {hasCount && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
