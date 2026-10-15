"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { toast } from "./Toast";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** toast message after copying; set to null to disable */
  toastMessage?: string | null;
}

/** Copies `text` to the clipboard and confirms with a check mark + toast. */
export function CopyButton({
  text,
  label = "コピー",
  copiedLabel = "コピーしました",
  variant = "secondary",
  size = "md",
  className,
  toastMessage = "クリップボードにコピーしました",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = async () => {
    const ok = await copyText(text);
    if (!ok) {
      toast("コピーできませんでした", "error", { description: "お手数ですが、文章を選択してコピーしてください。" });
      return;
    }
    setCopied(true);
    if (toastMessage) toast(toastMessage);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant={variant} size={size} icon={copied ? Check : Copy} onClick={onClick} className={className}>
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
