import React, { useEffect, useRef, useState } from "react";

async function decoder() {
  return (await import("jsqr")).default;
}
function pixels(source, width, height, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
export function QrScanner({ onRead, onClose }) {
  const video = useRef(null),
    callback = useRef(onRead);
  callback.current = onRead;
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true,
      stream,
      timer;
    const stop = () => {
      active = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    const hidden = () => {
      if (document.hidden) {
        stop();
        onClose();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error(
            "Camera access needs HTTPS or localhost. Please open the app with camera access.",
          );
        const decode = await decoder();
        if (!active) return;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.current.srcObject = stream;
        await video.current.play();
        if (!active) return;
        setReady(true);
        function scan() {
          if (!active) return;
          try {
            const v = video.current;
            if (v?.readyState >= 2 && v.videoWidth) {
              const image = pixels(v, v.videoWidth, v.videoHeight, 960);
              const code = decode(image.data, image.width, image.height);
              if (code) {
                stop();
                callback.current(code.data);
                return;
              }
            }
            timer = setTimeout(scan, 180);
          } catch {
            stop();
            setError("Could not read the camera. Please try again.");
          }
        }
        scan();
      } catch (e) {
        stop();
        if (document.visibilityState === "visible")
          setError(
            e.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access in your browser and try again."
              : e.name === "NotFoundError"
                ? "No camera found. Please open the app with camera access."
                : e.message || "Could not open your camera.",
          );
      }
    }
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [onClose]);
  return (
    <div className="qr-scanner">
      <video ref={video} muted playsInline aria-label="QR scanner camera" />
      {!ready && !error && <p role="status">Waiting for camera permission…</p>}
      <p>Point your camera at their Encounter QR code.</p>
      {error && <p role="alert">{error}</p>}
      <button className="quiet" onClick={onClose}>
        Stop scanning
      </button>
    </div>
  );
}
