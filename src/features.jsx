import React, { useState } from "react";
import { ProfileQr } from "./profile-qr.jsx";
import { api } from "./api.js";

export function Suggestions() {
  return (
    <section className="suggestions">
      <span className="sticker">A few ideas for Coy</span>
      <h1>
        Some feelings
        <br />
        need a little help.
      </h1>
      <p className="lede">Two ideas I’d love to see.</p>
      <article className="idea">
        <span className="idea-number">01 · Unsent</span>
        <h2>Letters that wait for a yes</h2>
        <p>
          Write what you’ve wanted to tell your crush. They only get to read it
          if you both like each other. It makes that first conversation
          personal, without risking a one-sided confession.
        </p>
      </article>
      <article className="idea">
        <span className="idea-number">02 · Encounter</span>
        <h2>For the person you almost missed</h2>
        <p>
          Exchange a temporary QR card when you meet someone. Decide later if
          you’d like to reconnect. If it’s mutual, you can say hi and choose to
          share your numbers—no pressure in the moment.
        </p>
      </article>
      <div className="small-ideas">
        <h2>A few smaller improvements</h2>
        <p>
          <strong>Nearby discovery:</strong> find people within a distance that
          makes meeting up realistic. Location stays optional.
        </p>
        <p>
          <strong>A profile that feels like you:</strong> a photo or avatar,
          interests, and one honest introduction before anyone swipes.
        </p>
        <p>
          <strong>Dark mode:</strong> a comfortable way to browse at night.
        </p>
      </div>
    </section>
  );
}

export function ProfileEditor({ user, onSaved }) {
  const [draft, setDraft] = useState({
    ...user,
    interests: user.interests.join(", "),
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState(undefined);
  const update = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/profile", {
        name: draft.name,
        age: Number(draft.age),
        city: draft.city,
        college: draft.college,
        bio: draft.bio,
        interests: draft.interests
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        published: draft.published,
        ...(avatar ? { avatar } : {}),
      });
      onSaved(result.user);
      setAvatar(undefined);
      setMessage("Profile saved.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 3 * 1024 * 1024
    ) {
      setMessage("Choose JPEG, PNG, or WebP under 3 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/photo", undefined, file);
      setAvatar(undefined);
      onSaved(result.user);
      setMessage("Photo uploaded. Save your other profile changes below.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }
  return (
    <section>
      <span className="sticker">Your kind of introduction</span>
      <h1>A little about you.</h1>
      <p className="lede">A face, an avatar, a few honest words.</p>
      <div className="profile-preview">
        <img
          src={
            avatar ||
            `${user.photo}${user.photo.startsWith("/media/") ? "?v=" + user.photoVersion : ""}`
          }
          alt="Your profile"
        />
        <div>
          <h2>Your photo. Your choice.</h2>
          <p>Pick an avatar or upload a photo.</p>
          <ProfileQr user={user} />
        </div>
      </div>
      <div
        className="avatar-options"
        role="group"
        aria-label="Choose an avatar"
      >
        {user.avatars.map((src) => (
          <button
            type="button"
            key={src}
            aria-label={`Avatar ${Number(src.match(/(\d+)\.svg/)[1]) + 1}`}
            aria-pressed={(avatar || user.photo) === src}
            disabled={busy}
            onClick={() => setAvatar(src)}
          >
            <img src={src} alt="" />
          </button>
        ))}
      </div>
      <label className="upload-label">
        Upload a photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
          disabled={busy}
        />
      </label>
      <p className="hint left">
        JPEG, PNG or WebP · up to 3 MB. Photo metadata is removed.
      </p>
      <form className="profile-form" onSubmit={save}>
        <label>
          Name
          <input
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>
        <label>
          Age
          <input
            type="number"
            min="18"
            max="100"
            required
            value={draft.age}
            onChange={(e) => update("age", e.target.value)}
          />
        </label>
        <label>
          City
          <input
            maxLength={80}
            required={draft.published}
            value={draft.city}
            onChange={(e) => update("city", e.target.value)}
          />
        </label>
        <label>
          College <span className="optional">optional</span>
          <input
            maxLength={100}
            value={draft.college}
            onChange={(e) => update("college", e.target.value)}
          />
        </label>
        <label>
          You, in a nutshell
          <textarea
            rows="3"
            maxLength={180}
            required={draft.published}
            placeholder="What makes you, you?"
            value={draft.bio}
            onChange={(e) => update("bio", e.target.value)}
          />
          <small>
            {draft.bio.length}/180 · People see this before liking or passing.
          </small>
        </label>
        <label>
          Interests
          <input
            value={draft.interests}
            onChange={(e) => update("interests", e.target.value)}
            placeholder="Music, coffee, hiking"
          />
          <small>Up to 8 interests, separated by commas.</small>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) => update("published", e.target.checked)}
          />
          <span>Show my profile in Discover</span>
        </label>
        <p className="hint left">
          Your profile starts private. Publishing lets other users see it.
          Turning this off hides your profile and matches from others.
        </p>
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <p className="session-note">
        This browser keeps your profile for 30 days. Clearing its cookies starts
        a new profile. Use a separate browser or private window to try another
        user.
      </p>
    </section>
  );
}

export function LocationPermission({ user, onSaved }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("coy-location-prompt") === "dismissed";
    } catch {
      return false;
    }
  });
  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem("coy-location-prompt", "dismissed");
    } catch {}
  }
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function enable() {
    setBusy(true);
    setError("");
    try {
      if (!navigator.geolocation)
        throw Error(
          "Location is unavailable in this browser. You can still browse everyone.",
        );
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        }),
      );
      const result = await api("/location", {
        enabled: true,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      onSaved(result.user);
    } catch (e) {
      setError(
        e.code === 1
          ? "Location access was denied. You can still browse everyone."
          : e.message || "Could not get your location. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    try {
      onSaved((await api("/location", { enabled: false })).user);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (user.locationEnabled)
    return (
      <div className="location-status">
        <span>Using your approximate location</span>
        <button
          className="quiet"
          disabled={busy}
          onClick={async () => {
            await disable();
            dismiss();
          }}
        >
          Clear location
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  if (dismissed)
    return (
      <button
        className="location-optional"
        onClick={() => {
          setDismissed(false);
          setError("");
        }}
      >
        Use location for better suggestions
      </button>
    );
  return (
    <div
      className="location-permission"
      role="region"
      aria-label="Location permission"
    >
      <h2>Meet people near you?</h2>
      <p>
        Allow location to find people nearby. Your exact location is never shown
        to others.
      </p>
      <div>
        <button className="btn" disabled={busy} onClick={enable}>
          {busy ? "Requesting location…" : "Allow location"}
        </button>
        <button className="quiet" disabled={busy} onClick={dismiss}>
          Not now
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
