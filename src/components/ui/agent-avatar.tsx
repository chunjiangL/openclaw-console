"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { pixelArt } from "@dicebear/collection";

type Props = {
  seed: string;
  size?: number;
  className?: string;
};

export function AgentAvatar({ seed, size = 24, className }: Props) {
  const svg = useMemo(
    () =>
      createAvatar(pixelArt, {
        seed,
        size,
        backgroundColor: ["transparent"],
      }).toString(),
    [seed, size]
  );

  return (
    <span
      className={`inline-block shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
