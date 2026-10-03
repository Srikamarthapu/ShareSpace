"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Circle,
  LoaderCircle,
  CirclePause,
  GitPullRequestArrow,
  TriangleAlert,
} from "lucide-react";
const stateLabels = {
  proposed: "Proposed",
  active: "Active",
  paused: "Paused",
  needs_coordination: "Needs coordination",
  awaiting_review: "Awaiting review",
} as const;

export function Status({ state }: { state: keyof typeof stateLabels }) {
  const Icon =
    state === "active"
      ? LoaderCircle
      : state === "needs_coordination"
        ? TriangleAlert
        : state === "paused"
          ? CirclePause
          : state === "awaiting_review"
            ? GitPullRequestArrow
            : Circle;
  return (
    <span className={`status status-${state}`}>
      <Icon size={13} aria-hidden="true" />
      {stateLabels[state]}
    </span>
  );
}
export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "SS";
  return (
    <span className={`avatar ${small ? "avatar-small" : ""}`} aria-hidden="true">
      {initials}
    </span>
  );
}
// GitHub photo when a login is known; otherwise a stable 5x5 mirrored pattern from the member id.
export function MemberAvatar({
  id,
  name,
  githubLogin,
  small = false,
}: {
  id: string;
  name: string;
  githubLogin?: string;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const className = `avatar member-avatar ${small ? "avatar-small" : ""}`;
  if (githubLogin && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small remote avatar; no optimizer config needed
      <img
        className={className}
        src={`https://github.com/${githubLogin}.png?size=64`}
        alt=""
        title={name}
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailed(true);
        }}
        onError={() => setFailed(true)}
      />
    );
  }
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const hue = hash % 360;
  const cells: React.ReactNode[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (!((hash >>> (row * 3 + col + 8)) & 1)) continue;
      cells.push(<rect key={`${row}-${col}`} x={col} y={row} width="1" height="1" />);
      if (col < 2)
        cells.push(<rect key={`${row}-${4 - col}`} x={4 - col} y={row} width="1" height="1" />);
    }
  }
  return (
    <span
      className={className}
      title={name}
      aria-hidden="true"
      style={{ background: `hsl(${hue} 25% 18%)`, borderColor: `hsl(${hue} 25% 32%)` }}
    >
      <svg
        viewBox="-1 -1 7 7"
        width="100%"
        height="100%"
        fill={`hsl(${hue} 45% 68%)`}
        shapeRendering="crispEdges"
      >
        {cells}
      </svg>
    </span>
  );
}
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [feedback, setFeedback] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("Copied");
    } catch {
      setFeedback("Copy unavailable — select the text to copy.");
    }
  }
  return (
    <span className="copy-control">
      <button type="button" className="button button-secondary" onClick={copy}>
        {feedback === "Copied" ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Copy size={15} aria-hidden="true" />
        )}
        {label}
      </button>
      <span className="copy-feedback" role="status">
        {feedback}
      </span>
    </span>
  );
}
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <Circle size={24} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
