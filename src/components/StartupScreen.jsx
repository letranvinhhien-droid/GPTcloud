import React from "react";

// Matches the initial HTML screen so loading stays continuous after React mounts.
export default function StartupScreen() {
  return (
    <div className="startup-screen" role="status" aria-live="polite">
      <div className="startup-brand">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M6 25V7l10 11L26 7v18M16 18v7"
            stroke="currentColor"
            strokeWidth="2.7"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <span>
          meridian<span className="startup-brand-dot">.</span>
        </span>
      </div>
      <div className="startup-spinner" aria-hidden="true" />
      <p className="startup-message">Opening your workspace…</p>
    </div>
  );
}
