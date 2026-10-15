/**
 * Domain-specific badges and display maps shared by the simulator and the admin screens,
 * so every screen shows categories / urgencies / statuses with the same colour, icon and label.
 * Colour is always paired with a text label (CONTRACT §5).
 */
import {
  Bell,
  BookOpen,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  GraduationCap,
  Hourglass,
  Info,
  KeyRound,
  Loader,
  Mail,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Phone,
  Play,
  ShieldCheck,
  Shirt,
  Siren,
  Sparkles,
  TriangleAlert,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  CLEANING_STATUS_LABELS,
  ISSUE_STATUS_LABELS,
  URGENCY_LABELS,
  type Category,
  type DecisionSource,
  type IssueStatus,
  type NotifyChannel,
  type StoreCleaningStatus,
  type Urgency,
} from "@/lib/types";
import { Badge, type BadgeSize, type BadgeTone } from "./Badge";

/* ------------------------------------------------------------------ */
/* Category                                                            */
/* ------------------------------------------------------------------ */

export const CATEGORY_TONES: Record<Category, BadgeTone> = {
  cleaning_start: "teal",
  cleaning_done: "green",
  leftover: "purple",
  machine_error: "amber",
  question: "blue",
  info: "gray",
  emergency: "red",
  chat: "gray",
  unknown: "amber",
};

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  cleaning_start: Play,
  cleaning_done: CircleCheck,
  leftover: Shirt,
  machine_error: WashingMachine,
  question: CircleHelp,
  info: Info,
  emergency: Siren,
  chat: MessageCircle,
  unknown: CircleDashed,
};

/** Hex colours per category for charts (SVG fills). Pair with a legend label. */
export const CATEGORY_COLORS: Record<Category, string> = {
  cleaning_start: "#06b6a4",
  cleaning_done: "#10b981",
  leftover: "#8b5cf6",
  machine_error: "#f59e0b",
  question: "#0ea5e9",
  info: "#94a3b8",
  emergency: "#ef4444",
  chat: "#cbd5e1",
  unknown: "#fbbf24",
};

export interface CategoryBadgeProps {
  category: Category;
  size?: BadgeSize;
  className?: string;
}

export function CategoryBadge({ category, size = "md", className }: CategoryBadgeProps) {
  return (
    <Badge
      tone={CATEGORY_TONES[category]}
      icon={CATEGORY_ICONS[category]}
      size={size}
      solid={category === "emergency"}
      className={className}
    >
      {CATEGORY_LABELS[category]}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Urgency                                                             */
/* ------------------------------------------------------------------ */

export const URGENCY_TONES: Record<Urgency, BadgeTone> = {
  normal: "green",
  attention: "amber",
  urgent: "red",
};

export const URGENCY_ICONS: Record<Urgency, LucideIcon> = {
  normal: CircleCheck,
  attention: TriangleAlert,
  urgent: Siren,
};

export const URGENCY_COLORS: Record<Urgency, string> = {
  normal: "#10b981",
  attention: "#f59e0b",
  urgent: "#ef4444",
};

export interface UrgencyBadgeProps {
  urgency: Urgency;
  size?: BadgeSize;
  className?: string;
}

export function UrgencyBadge({ urgency, size = "md", className }: UrgencyBadgeProps) {
  return (
    <Badge
      tone={URGENCY_TONES[urgency]}
      icon={URGENCY_ICONS[urgency]}
      size={size}
      solid={urgency === "urgent"}
      className={className}
    >
      {URGENCY_LABELS[urgency]}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Decision source                                                     */
/* ------------------------------------------------------------------ */

export const SOURCE_LABELS: Record<DecisionSource, string> = {
  rule: "キーワード判定",
  ai: "AI判定",
  learned: "修正済みの例から判定",
  faq: "よくある質問に一致",
  fallback: "判断できず人へ",
};

const SOURCE_TONES: Record<DecisionSource, BadgeTone> = {
  rule: "gray",
  ai: "purple",
  learned: "teal",
  faq: "blue",
  fallback: "amber",
};

const SOURCE_ICONS: Record<DecisionSource, LucideIcon> = {
  rule: KeyRound,
  ai: Sparkles,
  learned: GraduationCap,
  faq: BookOpen,
  fallback: ShieldCheck,
};

export interface DecisionSourceBadgeProps {
  source: DecisionSource;
  /** true when the AI part came from the sample (mock) provider */
  sample?: boolean;
  size?: BadgeSize;
  className?: string;
}

/** 「AI判定（サンプル）」「修正済みの例から判定」など、判定の根拠を示すバッジ */
export function DecisionSourceBadge({ source, sample = false, size = "md", className }: DecisionSourceBadgeProps) {
  const label = source === "ai" && sample ? "AI判定（サンプル）" : SOURCE_LABELS[source];
  return (
    <Badge tone={SOURCE_TONES[source]} icon={SOURCE_ICONS[source]} size={size} className={className}>
      {label}
    </Badge>
  );
}

export interface SampleAiBadgeProps {
  size?: BadgeSize;
  className?: string;
}

/** 「AI判定（サンプル）」 label — shown wherever the mock AI produced a result. */
export function SampleAiBadge({ size = "md", className }: SampleAiBadgeProps) {
  return (
    <Badge tone="purple" icon={Sparkles} size={size} className={className}>
      AI判定（サンプル）
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Issue / cleaning status                                             */
/* ------------------------------------------------------------------ */

export const ISSUE_STATUS_TONES: Record<IssueStatus, BadgeTone> = {
  open: "red",
  in_progress: "amber",
  resolved: "green",
};

const ISSUE_STATUS_ICONS: Record<IssueStatus, LucideIcon> = {
  open: CircleDot,
  in_progress: Loader,
  resolved: CircleCheck,
};

export function IssueStatusBadge({
  status,
  size = "md",
  className,
}: {
  status: IssueStatus;
  size?: BadgeSize;
  className?: string;
}) {
  return (
    <Badge tone={ISSUE_STATUS_TONES[status]} icon={ISSUE_STATUS_ICONS[status]} size={size} className={className}>
      {ISSUE_STATUS_LABELS[status]}
    </Badge>
  );
}

export const CLEANING_STATUS_TONES: Record<StoreCleaningStatus, BadgeTone> = {
  not_started: "gray",
  cleaning: "blue",
  awaiting_photo: "amber",
  done: "green",
};

const CLEANING_STATUS_ICONS: Record<StoreCleaningStatus, LucideIcon> = {
  not_started: CircleDashed,
  cleaning: Sparkles,
  awaiting_photo: Hourglass,
  done: CircleCheck,
};

export function CleaningStatusBadge({
  status,
  size = "md",
  className,
}: {
  status: StoreCleaningStatus;
  size?: BadgeSize;
  className?: string;
}) {
  return (
    <Badge
      tone={CLEANING_STATUS_TONES[status]}
      icon={CLEANING_STATUS_ICONS[status]}
      size={size}
      className={className}
    >
      {CLEANING_STATUS_LABELS[status]}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Notification channels                                               */
/* ------------------------------------------------------------------ */

export const CHANNEL_ICONS: Record<NotifyChannel, LucideIcon> = {
  line_group: MessagesSquare,
  email: Mail,
  chatwork: MessageSquareText,
  phone: Phone,
};

/** Generic "notification" icon, re-exported for convenience. */
export const NotificationIcon = Bell;
