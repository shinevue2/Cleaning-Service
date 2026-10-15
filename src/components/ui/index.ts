/**
 * UI kit barrel. Import from "@/components/ui".
 *
 * Server-safe (hook-free): Button, ButtonLink, IconButton, Badge, domain badges, Card, PageHeader,
 * EmptyState, Skeleton, Avatar, Callout, Spinner, Meter, ConfidenceMeter, Kbd.
 * Client-only ("use client"): Field/Input/Textarea/Select, Toggle/Checkbox, Modal/ConfirmDialog,
 * Tabs/TabPanel, Toast (useToast/toast/ToastViewport), CopyButton.
 */
export { renderIcon, type IconLike, type IconComponent } from "./icon";

export {
  Button,
  ButtonLink,
  IconButton,
  buttonClasses,
  type ButtonProps,
  type ButtonLinkProps,
  type IconButtonProps,
  type ButtonVariant,
  type ButtonSize,
  type ButtonStyleOptions,
} from "./Button";

export { Badge, type BadgeProps, type BadgeTone, type BadgeSize } from "./Badge";

export {
  CategoryBadge,
  UrgencyBadge,
  DecisionSourceBadge,
  SampleAiBadge,
  IssueStatusBadge,
  CleaningStatusBadge,
  CATEGORY_TONES,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  URGENCY_TONES,
  URGENCY_ICONS,
  URGENCY_COLORS,
  SOURCE_LABELS,
  ISSUE_STATUS_TONES,
  CLEANING_STATUS_TONES,
  CHANNEL_ICONS,
  NotificationIcon,
  type CategoryBadgeProps,
  type UrgencyBadgeProps,
  type DecisionSourceBadgeProps,
  type SampleAiBadgeProps,
} from "./domain";

export {
  Card,
  PageHeader,
  EmptyState,
  Skeleton,
  SkeletonText,
  type CardProps,
  type PageHeaderProps,
  type EmptyStateProps,
  type SkeletonProps,
} from "./Card";

export { Avatar, BotAvatar, avatarInitial, type AvatarProps, type AvatarSize, type BotAvatarProps } from "./Avatar";

export {
  Callout,
  Spinner,
  Meter,
  ConfidenceMeter,
  Kbd,
  type CalloutProps,
  type CalloutTone,
  type MeterProps,
  type MeterTone,
  type ConfidenceMeterProps,
} from "./Feedback";

export {
  Field,
  Input,
  Textarea,
  Select,
  useFieldControl,
  type FieldProps,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type SelectOption,
} from "./Field";

export { Toggle, Checkbox, type ToggleProps, type CheckboxProps } from "./Toggle";

export { Modal, ConfirmDialog, type ModalProps, type ModalSize, type ConfirmDialogProps } from "./Modal";

export { Tabs, TabPanel, type TabsProps, type TabItem, type TabPanelProps } from "./Tabs";

export {
  ToastViewport,
  useToast,
  toast,
  dismissToast,
  setToastPlacement,
  useToastPlacement,
  type ToastFn,
  type ToastTone,
  type ToastOptions,
  type ToastItem,
  type ToastAction,
  type ToastPlacement,
} from "./Toast";

export { CopyButton, type CopyButtonProps } from "./CopyButton";
