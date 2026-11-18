import React, { useState } from "react";

const storageKey = "coy-home-suggestions-dismissed-v1";

export function HomeNote() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {}
  }
  return (
    <aside className="home-note" aria-labelledby="suggestions-title">
      <button
        className="note-dismiss"
        type="button"
        onClick={dismiss}
        aria-label="Dismiss suggestions"
      >
        ×
      </button>
      <span className="note-eyebrow">A small note</span>
      <h2 id="suggestions-title">Two ideas I’d love to see in Coy</h2>
      <p>
        <strong>Unsent.</strong> Write what you feel. Your crush only reads the
        letter if you both like each other—a more personal way to start.
      </p>
      <p>
        <strong>Encounter.</strong> Exchange QR cards with someone you meet,
        then decide later if you’d like to reconnect. No pressure to share a
        number on the spot.
      </p>
      <p className="note-extras">
        A few smaller ideas: nearby discovery, photos or avatars, short
        introductions, and dark mode.
      </p>
    </aside>
  );
}
