import React from "react";

/** Explicit “new” plus + horizontal step flow — Process / Bank Process “Add Process” toolbar. */
export default function AddProcessIcon() {
  return (
    <svg className="btn-add__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.5v5M9.5 7h5"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 18h12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.9}
      />
      <circle cx={6} cy={18} r={3} fill="currentColor" />
      <circle cx={12} cy={18} r={3} fill="currentColor" />
      <circle cx={18} cy={18} r={3} fill="currentColor" />
    </svg>
  );
}
