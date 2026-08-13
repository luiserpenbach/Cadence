"use client";

import { useCallback, useSyncExternalStore } from "react";
import { IDENTITY_COOKIE, IDENTITY_STORAGE_KEY } from "../lib/identity";
import { compactInputClass, inputClass } from "./ui";

const IDENTITY_EVENT = "cadence-identity";

function readStoredIdentity(): string {
  try {
    const stored = localStorage.getItem(IDENTITY_STORAGE_KEY) ?? "";
    if (stored.trim()) return stored;
  } catch {
    /* private mode */
  }
  if (typeof document === "undefined") return "";
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${IDENTITY_COOKIE}=`));
  return cookie
    ? decodeURIComponent(cookie.split("=").slice(1).join("="))
    : "";
}

function persistIdentity(value: string) {
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, value);
  } catch {
    /* private mode */
  }
  document.cookie = `${IDENTITY_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  window.dispatchEvent(new Event(IDENTITY_EVENT));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(IDENTITY_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(IDENTITY_EVENT, onStoreChange);
  };
}

function getServerSnapshot() {
  return "";
}

export function IdentityField({
  name = "by",
  className,
  compact,
  hidden,
  required = true,
  placeholder = "Your name",
}: {
  name?: string;
  className?: string;
  compact?: boolean;
  hidden?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const value = useSyncExternalStore(
    subscribe,
    readStoredIdentity,
    getServerSnapshot,
  );
  const onChange = useCallback((next: string) => {
    persistIdentity(next);
  }, []);

  const cls =
    className ?? (compact ? `w-28 ${compactInputClass}` : inputClass);

  return (
    <input
      type={hidden ? "hidden" : "text"}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={hidden ? undefined : placeholder}
      required={hidden ? false : required}
      className={hidden ? undefined : cls}
      aria-label={hidden ? undefined : "Identity"}
      autoComplete="username"
    />
  );
}

export function IdentityChip() {
  return (
    <label className="ml-2 flex shrink-0 items-center gap-1.5 py-2">
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] sm:inline">
        You
      </span>
      <IdentityField
        name="identity"
        required={false}
        className={`w-28 ${compactInputClass}`}
      />
    </label>
  );
}
