import React from "react";

/** Stacked layers + plus — used on Process / Bank Process “Add Process” toolbar buttons. */
export default function AddProcessIcon() {
  return (
    <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path opacity="0.88" d="M4.5 15.3 12 18.9 19.5 15.3v-3.2L12 15.7 4.5 12.1v3.2z" />
      <path d="M4.5 10.5 12 14.1 19.5 10.5V7.9L12 11.5 4.5 7.9v2.6z" />
      <path d="M15.9 3.2h1.65v1.6h1.6v1.65h-1.6v1.65h-1.65v-1.65h-1.6V7.4h1.6V3.2z" />
    </svg>
  );
}
