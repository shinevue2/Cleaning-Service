import { Bot } from "lucide-react";
import { cn } from "@/lib/format";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZE: Record<AvatarSize, string> = {
  xs: "size-6 text-[11px]",
  sm: "size-8 text-[13px]",
  md: "size-10 text-[15px]",
  lg: "size-12 text-lg",
};

const BOT_ICON: Record<AvatarSize, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

/** First visible character of a display name, ignoring brackets like 「山本（コールセンター）」. */
export function avatarInitial(name: string): string {
  const cleaned = name.replace(/[（(【[].*?[）)】\]]/g, "").trim();
  return Array.from(cleaned || name)[0] ?? "?";
}

export interface AvatarProps {
  name: string;
  /** background colour, e.g. member.avatarColor ("#f59e0b") */
  color: string;
  size?: AvatarSize;
  className?: string;
  /**
   * Accessible label. By default the avatar is decorative (the name is usually shown next to it);
   * pass `label` when the avatar stands alone.
   */
  label?: string;
}

export function Avatar({ name, color, size = "md", className, label }: AvatarProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ring-2 ring-white/70",
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: color, textShadow: "0 1px 1px rgb(0 0 0 / 0.25)" }}
    >
      {avatarInitial(name)}
    </span>
  );
}

export interface BotAvatarProps {
  size?: AvatarSize;
  className?: string;
  label?: string;
}

/** The assistant's avatar (teal gradient with a robot icon). */
export function BotAvatar({ size = "md", className, label }: BotAvatarProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-white ring-2 ring-white/70",
        SIZE[size],
        className,
      )}
    >
      <Bot className={BOT_ICON[size]} aria-hidden />
    </span>
  );
}
