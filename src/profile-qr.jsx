import React, { useEffect, useRef, useState } from "react";
export function ProfileQr({ user }) {
  const [show, setShow] = useState(false),
    [error, setError] = useState("");
  const canvas = useRef(null),
    dialog = useRef(null);
  useEffect(() => {
    if (!show) return;
    dialog.current?.showModal();
    let active = true;
    import("qrcode")
      .then((m) => {
        if (active)
          return m.default.toCanvas(
            canvas.current,
            JSON.stringify({ name: user.name, id: user.id }),
            { width: 240, margin: 3 },
          );
      })
      .catch(() => setError("Could not generate your QR. Please try again."));
    return () => {
      active = false;
    };
  }, [show, user.id, user.name]);
  return (
    <div className="profile-qr">
      <button
        type="button"
        className="qr-compact-button"
        onClick={() => setShow(true)}
        aria-label="Generate my QR"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2" />
        </svg>
        My QR
      </button>
      {show && (
        <dialog
          ref={dialog}
          className="profile-qr-dialog"
          onCancel={() => setShow(false)}
          aria-label="Your personal QR"
        >
          <button
            type="button"
            className="close-dialog"
            aria-label="Close QR"
            onClick={() => setShow(false)}
          >
            ×
          </button>
          <h2>Your personal QR</h2>
          <p>
            Show this to someone you meet. It contains only your name and unique
            profile ID.
          </p>
          <div className="encounter-card">
            <canvas ref={canvas} aria-label="My profile QR code" />
            <strong>{user.name}</strong>
            <p className="profile-id">{user.id}</p>
            {!user.published && (
              <p>Publish your profile below so others can save your QR.</p>
            )}
          </div>
        </dialog>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
