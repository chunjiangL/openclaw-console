"use client";

type Props = {
  size?: number;
  className?: string;
};

/**
 * Pixel-art chat bubble icon for user messages.
 */
export function UserAvatar({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={`inline-block shrink-0 ${className ?? ""}`}
      role="img"
      aria-label="User"
    >
      {/* Bubble body */}
      <rect x="2" y="2" width="12" height="2" fill="currentColor" />
      <rect x="1" y="4" width="14" height="6" fill="currentColor" />
      <rect x="2" y="10" width="12" height="2" fill="currentColor" />
      {/* Tail */}
      <rect x="3" y="12" width="3" height="1" fill="currentColor" />
      <rect x="2" y="13" width="2" height="1" fill="currentColor" />
      {/* Dots inside (typing indicator) */}
      <rect x="4" y="6" width="2" height="2" fill="var(--surface)" />
      <rect x="7" y="6" width="2" height="2" fill="var(--surface)" />
      <rect x="10" y="6" width="2" height="2" fill="var(--surface)" />
    </svg>
  );
}
