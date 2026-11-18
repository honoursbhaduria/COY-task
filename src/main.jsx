import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { api } from "./api.js";
import { ProfileEditor, LocationPermission } from "./features.jsx";
import {
  Unsent,
  Encounters,
  MatchContact,
  MatchedLetter,
} from "./connections.jsx";

function TabIcon({ name, active }) {
  if (name === "Home") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
      </svg>
    );
  }
  if (name === "Discover") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" />
      </svg>
    );
  }
  if (name === "Matches") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    );
  }
  if (name === "Encounter") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2" />
      </svg>
    );
  }
  if (name === "Profile") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  return null;
}

function App() {
  const [letterProfile, setLetterProfile] = useState(null);
  const [encounterToken] = useState(() =>
    new URLSearchParams(location.search).get("encounter"),
  );
  function encounterResult(result) {
    if (result.matched) setMatch(result.match);
    load();
  }
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("coy-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("coy-theme", theme);
    } catch {}
  }, [theme]);
  function saved(next) {
    setUser({ ...next, photoVersion: Date.now() });
    load();
  }
  const [tab, setTab] = useState(encounterToken ? "Encounter" : "Discover"),
    [feed, setFeed] = useState([]),
    [matches, setMatches] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [match, setMatch] = useState(null),
    [drag, setDrag] = useState(0),
    [leaving, setLeaving] = useState("");
  const start = useRef(null),
    lock = useRef(false),
    dialog = useRef(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [f, m] = await Promise.all([api("/feed"), api("/matches")]);
      setFeed(f.profiles);
      setMatches(m.matches);
    } catch (e) {
      setFeed([]);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    api("/session", {})
      .then((d) => {
        setUser(d.user);
        load();
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (match) dialog.current?.showModal();
  }, [match]);
  async function swipe(action) {
    if (lock.current || !feed.length || loading || match) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api("/swipe", { profileId: feed[0].id, action });
      setLeaving(action);
      await new Promise((r) => setTimeout(r, 230));
      setFeed((f) => f.slice(1));
      if (result.matched) {
        setMatches((m) => [result.match, ...m]);
        setMatch(result.match);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLeaving("");
      setDrag(0);
      setBusy(false);
      lock.current = false;
    }
  }
  const p = feed[0];
  if (!user)
    return (
      <main className="sheet">
        <p role="status">{error || "Opening Coy…"}</p>
        {error && (
          <button className="btn" onClick={() => location.reload()}>
            Retry
          </button>
        )}
      </main>
    );
  return (
    <main className="sheet">
      <header className="top">
        <a className="wordmark" href="/" aria-label="Coy">
          coy
        </a>
        <button
          className="theme-toggle"
          aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>
      {tab === "Encounter" && (
        <Encounters
          user={user}
          onMatch={encounterResult}
          onProfile={() => setTab("Profile")}
          initialToken={encounterToken}
        />
      )}
      {tab === "Profile" && <ProfileEditor user={user} onSaved={saved} />}
      {tab === "Discover" && (
        <>
          <section className="heading">
            <span className="sticker">✦ A little curiosity</span>
            <h1>
              Someone new.
              <br />
              Something real.
            </h1>
            <p className="lede">Meet your next “what if”.</p>
          </section>
          <div className="privacy">
            <span>♡</span>
            <p>
              Your likes stay secret.
              <br />
              <strong>Until the feeling is mutual.</strong>
            </p>
            <span className="spark">✧</span>
          </div>
          <LocationPermission user={user} onSaved={saved} />
          {error && (
            <div role="alert" className="error">
              {error} <button onClick={load}>Try again</button>
            </div>
          )}
          {loading ? (
            <div className="empty" role="status">
              Finding your people…
            </div>
          ) : p ? (
            <>
              <div className="deck">
                <article
                  aria-label={`${p.name}'s profile`}
                  className={`profile ${leaving}`}
                  style={{
                    transform: leaving
                      ? undefined
                      : `translateX(${drag}px) rotate(${drag / 18}deg)`,
                  }}
                  onPointerDown={(e) => {
                    if (busy) return;
                    start.current = e.clientX;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (start.current !== null)
                      setDrag(e.clientX - start.current);
                  }}
                  onPointerUp={() => {
                    const d = drag;
                    start.current = null;
                    setDrag(0);
                    if (Math.abs(d) > 85) swipe(d > 0 ? "like" : "pass");
                  }}
                  onPointerCancel={() => {
                    start.current = null;
                    setDrag(0);
                  }}
                >
                  <div className="photo">
                    <img
                      draggable="false"
                      src={p.photo}
                      alt={
                        p.isMock
                          ? `Illustrated placeholder for ${p.name}`
                          : `${p.name}’s profile photo`
                      }
                    />
                    {Math.abs(drag) > 35 && (
                      <span className={`stamp ${drag > 0 ? "yes" : "no"}`}>
                        {drag > 0 ? "LIKE" : "PASS"}
                      </span>
                    )}
                    <div className="identity">
                      <h2>
                        {p.name}, {p.age}
                      </h2>
                      <p>
                        ⌖ {[p.city, p.college].filter(Boolean).join(" · ")}
                        {p.distanceKm ? ` · within ~${p.distanceKm} km` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="bio">
                    <p>{p.bio}</p>
                    <div className="interests">
                      {p.interests.map((i) => (
                        <span key={i}>{i}</span>
                      ))}
                    </div>
                  </div>
                </article>
              </div>
              <button
                className="unsent-action"
                disabled={busy}
                onClick={() => setLetterProfile(p)}
              >
                ✉ Write an Unsent letter <span>Opens only if you match</span>
              </button>
              <div className="swipe-actions">
                <button
                  disabled={busy}
                  className="pass"
                  aria-label="Pass on profile"
                  onClick={() => swipe("pass")}
                >
                  ×
                </button>
                <span>Go with your gut.</span>
                <button
                  disabled={busy}
                  className="like-button"
                  aria-label="Like profile"
                  onClick={() => swipe("like")}
                >
                  ♡
                </button>
              </div>
              <p className="hint">Swipe left to pass. Right to like.</p>
            </>
          ) : (
            !error && (
              <div className="empty">
                <span>✦</span>
                <h2>You're all caught up.</h2>
                <p>
                  A little patience. A little possibility.
                  <br />
                  {user.locationEnabled
                    ? "No more profiles within your distance. Clear location to browse everyone."
                    : "You’ve met everyone available right now. Check back when more people join."}
                </p>
                <button className="btn" onClick={() => setTab("Matches")}>
                  See your matches
                </button>
              </div>
            )
          )}
        </>
      )}
      {tab === "Matches" && (
        <section>
          <span className="sticker">♡ The feeling is mutual</span>
          <h1>Your matches.</h1>
          <p className="lede">Two quiet likes. One lovely possibility.</p>
          {matches.length ? (
            <div className="match-list">
              {matches.map((m) => (
                <div className="match-row" key={m.id}>
                  <img src={m.photo} alt="" />
                  <span>
                    <strong>
                      {m.name}, {m.age}
                    </strong>
                    <small>{m.city}</small>
                  </span>
                  <MatchContact profile={m} />
                  <MatchedLetter profile={m} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <span>♡</span>
              <h2>A little spark is on its way.</h2>
              <p>
                When you both like each other,
                <br />
                you’ll find them here.
              </p>
              <button className="btn" onClick={() => setTab("Discover")}>
                Keep discovering
              </button>
            </div>
          )}
        </section>
      )}
      <nav className="tabs" aria-label="Main navigation">
        {["Home", "Discover", "Matches", "Encounter", "Profile"].map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => {
              setTab(t);
              if (t === "Matches" || t === "Discover") load();
            }}
          >
            <span className="tab-icon">
              <TabIcon name={t} active={tab === t} />
            </span>
            <span>{t}</span>
            {t === "Matches" && matches.length > 0 && <b>{matches.length}</b>}
          </button>
        ))}
      </nav>
      {letterProfile && (
        <Unsent
          key={letterProfile.id}
          profile={letterProfile}
          onClose={() => setLetterProfile(null)}
        />
      )}
      {match && (
        <dialog
          ref={dialog}
          onCancel={() => setMatch(null)}
          className="match-dialog"
        >
          <div className="sticker">It goes both ways!</div>
          <div className="match-portrait">
            <img src={match.photo} alt={match.name} />
            <span>♡</span>
          </div>
          <h1>It’s a match!</h1>
          <p>
            You and {match.name} like each other.
            <br />
            Your little secret is now a shared one.
          </p>
          <button
            autoFocus
            className="btn"
            onClick={() => {
              setMatch(null);
              setTab("Matches");
            }}
          >
            See matches
          </button>
          <button className="quiet" onClick={() => setMatch(null)}>
            Keep discovering
          </button>
        </dialog>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
