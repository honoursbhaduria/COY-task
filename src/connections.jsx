import React, { useCallback, useEffect, useRef, useState } from "react";
import { QrScanner, readQrImage } from "./qr-scanner.jsx";
import { api } from "./api.js";

export function Unsent({ profile, onClose }) {
  const dialog = useRef(null);
  const [body, setBody] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(`/letters/${profile.id}`)
      .then((d) => {
        if (active) {
          setBody(d.letter.body);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [profile.id, attempt]);
  async function save(e) {
    e.preventDefault();
    if (loading || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/letters/${profile.id}`, { body });
      setNotice(
        body.trim()
          ? "Letter saved. It opens only when you both like each other."
          : "Letter removed.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="letter-dialog"
      aria-labelledby="letter-title"
      aria-describedby="letter-description"
    >
      <header className="letter-header">
        <span className="sticker">✉ Unsent</span>
        <button
          autoFocus
          type="button"
          className="close-dialog"
          onClick={onClose}
          aria-label="Close letter"
        >
          ×
        </button>
      </header>
      <form id="unsent-form" className="letter-content" onSubmit={save}>
        <div className="letter-recipient">
          <img src={profile.photo} alt="" />
          <div>
            <span>A little courage, kept safe.</span>
            <h2 id="letter-title">For {profile.name}, someday.</h2>
          </div>
        </div>
        <p id="letter-description">
          Say what you feel. They’ll only read this if you both like each other.
        </p>
        <label className="letter-field" htmlFor="letter-body">
          Your letter
        </label>
        <textarea
          id="letter-body"
          rows="7"
          maxLength={2000}
          readOnly={loading || busy}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setNotice("");
          }}
          placeholder={
            loading
              ? "Opening your letter…"
              : "Something I’ve wanted to tell you…"
          }
          aria-describedby="letter-count letter-help"
        />
        <div className="letter-meta">
          <span id="letter-help">Just your words. No pressure.</span>
          <span id="letter-count">{body.length.toLocaleString()}/2,000</span>
        </div>
        {error && (
          <div role="alert" className="letter-feedback error">
            {error}
            {loading && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="letter-feedback notice">
            {notice}
          </p>
        )}
        <p className="letter-footnote">
          Clear and save to remove. An opened letter may already have been read
          or copied.
        </p>
      </form>
      <footer className="letter-footer">
        <button
          type="submit"
          form="unsent-form"
          className="btn"
          disabled={loading || busy}
        >
          {busy ? "Saving…" : "Save letter"}
        </button>
        <p>Saving a letter doesn’t send a like.</p>
      </footer>
    </dialog>
  );
}

export function SayHi({ matches, onOpen }) {
  if (!matches.length) return null;
  return (
    <section className="say-hi">
      <div className="section-head">
        <h2>Say hi ♡</h2>
        <span>It’s mutual.</span>
      </div>
      <div className="hi-list">
        {matches.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p.id)}
            aria-label={`Say hi to ${p.name}`}
          >
            <img src={p.photo} alt="" />
            <strong>{p.name}</strong>
            <small>Say hi →</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Conversation({ target, onBack, onLetter }) {
  const [data, setData] = useState(null),
    [body, setBody] = useState(""),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const d = await api(`/connections/${target}`);
        if (active) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(e.message);
          setData(null);
        }
      }
    }
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [target]);
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (!pending.current || pending.current.body !== body)
      pending.current = { body, requestId: crypto.randomUUID() };
    try {
      await api(`/connections/${target}/messages`, pending.current);
      setBody("");
      pending.current = null;
      setData(await api(`/connections/${target}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function share(value) {
    setBusy(true);
    setError("");
    try {
      await api(`/connections/${target}/contact`, { phone: value });
      setData(await api(`/connections/${target}`));
      setPhone("");
      setNotice(
        value
          ? "Your number is shared with this match only."
          : "Your number is no longer shown.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="conversation">
      <button className="quiet back" onClick={onBack}>
        ← All matches
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data ? (
        <>
          <div className="conversation-head">
            <img src={data.profile.photo} alt="" />
            <div>
              <h1>{data.profile.name}</h1>
              <p>♡ You both said yes.</p>
            </div>
          </div>
          {data.profile.isMock && (
            <p className="notice">
              This is a mock profile. Messages are saved for the demo; no real
              person will reply.
            </p>
          )}
          {data.receivedLetter ? (
            <article className="opened-letter">
              <span>Unsent, now open.</span>
              <h2>A letter from {data.profile.name}</h2>
              <p>{data.receivedLetter}</p>
            </article>
          ) : (
            <p className="hint left">
              Any letter they wrote to you opens here after you match.
            </p>
          )}
          <button className="quiet" onClick={() => onLetter(data.profile)}>
            Write or edit your letter
          </button>
          <h2 className="chat-title">Say hi</h2>
          <div className="messages" role="log" aria-label="Conversation">
            {data.messages.length ? (
              data.messages.map((m) => (
                <div key={m.id} className={`message ${m.mine ? "mine" : ""}`}>
                  <span>{m.mine ? "You" : data.profile.name}</span>
                  <p>{m.body}</p>
                  <time dateTime={m.sentAt}>
                    {new Date(m.sentAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))
            ) : (
              <p className="hint">A simple hello is a good place to start.</p>
            )}
          </div>
          <p className="hint left">
            Latest 100 messages · updates every few seconds.
          </p>
          <form className="message-form" onSubmit={send}>
            <label>
              Message
              <textarea
                rows="2"
                maxLength={1000}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`Say hi to ${data.profile.name}…`}
              />
            </label>
            <button className="btn" disabled={busy || !body.trim()}>
              Send message
            </button>
          </form>
          {!data.profile.isMock && (
            <details className="contact-sharing">
              <summary>Ready to exchange numbers?</summary>
              <p>
                Sharing is optional, and only this match can see your number.
              </p>
              {data.sharedPhone ? (
                <p>
                  <strong>Their shared number:</strong>{" "}
                  <a href={`tel:${data.sharedPhone}`}>{data.sharedPhone}</a>
                </p>
              ) : (
                <p>They haven’t shared a number yet.</p>
              )}
              {data.ownPhone ? (
                <>
                  <p>
                    <strong>You’re sharing:</strong> {data.ownPhone}
                  </p>
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() => share("")}
                  >
                    Stop sharing my number
                  </button>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    share(phone);
                  }}
                >
                  <label>
                    Your phone number
                    <input
                      type="tel"
                      autoComplete="tel"
                      placeholder="+91 98765 43210"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>
                  <button className="btn" disabled={busy}>
                    Share with this match
                  </button>
                </form>
              )}
              <p className="hint left">
                Only share a number you own. Removing it cannot undo someone
                saving it.
              </p>
              {notice && <p role="status">{notice}</p>}
            </details>
          )}
        </>
      ) : (
        !error && <p role="status">Opening your conversation…</p>
      )}
    </section>
  );
}

export function Encounters({ user, onMatch, onProfile, initialToken }) {
  const [card, setCard] = useState(null),
    [scanning, setScanning] = useState(false),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now());
  const stopScanning = useCallback(() => setScanning(false), []);
  const canvas = useRef(null);
  const url = card ? `${location.origin}/?encounter=${card.token}` : "";
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!url) return;
    let active = true;
    import("qrcode")
      .then((module) => {
        if (active && canvas.current)
          return module.default.toCanvas(canvas.current, url, {
            width: 240,
            margin: 3,
            errorCorrectionLevel: "M",
          });
      })
      .catch(() =>
        setError("Could not draw the QR code. Please create a new card."),
      );
    return () => {
      active = false;
    };
  }, [url]);
  useEffect(() => {
    if (initialToken) inspect(initialToken);
  }, [initialToken]);
  function tokenOf(value) {
    const trimmed = value.trim();
    if (/^[a-f0-9]{48}$/.test(trimmed)) return trimmed;
    const parsed = new URL(trimmed);
    if (parsed.origin !== location.origin)
      throw Error("Scan an Encounter QR code from this app.");
    const token = parsed.searchParams.get("encounter");
    if (!token || !/^[a-f0-9]{48}$/.test(token))
      throw Error("That QR code is not an Encounter card.");
    return token;
  }
  async function inspect(value) {
    setScanning(false);
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const token = tokenOf(value);
      setPreview({ ...(await api(`/encounters/${token}`)), token });
    } catch (e) {
      setError(
        e.message === "Invalid URL"
          ? "That QR code is not a valid Encounter card."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setCard(await api("/encounters", {}));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    try {
      await api("/encounters/revoke", {});
      setCard(null);
      setNotice("Your previous card is no longer valid.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function like() {
    setBusy(true);
    setError("");
    try {
      const result = await api(`/encounters/${preview.token}/like`, {});
      onMatch(result);
      setNotice(
        result.matched
          ? "The feeling is mutual!"
          : "Your interest is saved. They’ll only know if they like you too.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const expired = card && Date.parse(card.expiresAt) <= clock;
  return (
    <section className="encounters">
      <span className="sticker">Encounter</span>
      <h1>
        A hello.
        <br />A second chance.
      </h1>
      <p className="lede">For the person you met but never got their number.</p>
      <p className="encounter-intro">
        Exchange temporary QR cards in person. If you both feel a spark later,
        add each other as a crush. Numbers stay private until you match and
        choose to share.
      </p>
      {!user.published ? (
        <div className="notice">
          Publish your profile to exchange cards.
          <button className="quiet" onClick={onProfile}>
            Edit my profile →
          </button>
        </div>
      ) : (
        <>
          <button className="btn wide" disabled={busy} onClick={create}>
            {card ? "Create a new card" : "Create my encounter card"}
          </button>
          {card && (
            <div className="encounter-card">
              <h2>{user.name}’s encounter card</h2>
              {!expired ? (
                <>
                  <canvas ref={canvas} aria-label="My Encounter QR code" />
                  <p>
                    Expires{" "}
                    {new Date(card.expiresAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </>
              ) : (
                <p>This card has expired. Create a new one to reconnect.</p>
              )}
              <button className="quiet" disabled={busy} onClick={revoke}>
                Revoke card
              </button>
            </div>
          )}
          <p className="hint left">
            A new card replaces your previous one. Anyone who scans your QR can
            view your published profile until it expires. Share it only with
            someone you want to meet again.
          </p>
          {["localhost", "127.0.0.1"].includes(location.hostname) && (
            <p className="hint left">
              For another phone to scan this, open the app at a shared HTTPS
              address. A local-only app cannot connect two phones.
            </p>
          )}
        </>
      )}
      <div className="encounter-form">
        <h2>Scan their card</h2>
        <p>
          Point your camera at their Encounter QR. Their profile opens here—no
          typing needed.
        </p>
        {scanning ? (
          <QrScanner onClose={stopScanning} onRead={inspect} />
        ) : (
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setError("");
              setPreview(null);
              setScanning(true);
            }}
          >
            Scan QR code
          </button>
        )}
        <label className="qr-upload">
          Or scan a QR image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy || scanning}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError("");
              setPreview(null);
              try {
                await inspect(await readQrImage(file));
              } catch (err) {
                setError(err.message || "Could not read that image.");
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        <p className="hint left">
          Camera frames and QR images are read on your device, never uploaded.
        </p>
      </div>
      {preview && (
        <article className="encounter-preview">
          <img src={preview.profile.photo} alt={preview.profile.name} />
          <h2>
            {preview.profile.name}, {preview.profile.age}
          </h2>
          <p>{preview.profile.bio}</p>
          <button
            className="btn"
            disabled={busy || !user.published}
            onClick={like}
          >
            Add as a crush ♡
          </button>
          <p className="hint">
            Uses one of your daily swipes. A previous pass cannot be changed.
          </p>
        </article>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
