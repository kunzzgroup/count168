import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

let _notifyFn = null;

/** Call this from anywhere to show a notification */
export function showDomainAlert(message, type = "success") {
  if (_notifyFn) _notifyFn(message, type);
}

/** Full-viewport anchor so toasts are never trapped under #root or modal backdrops */
function getDomainToastAnchor() {
  if (typeof document === "undefined" || !document.body) return null;
  let el = document.getElementById("domain-toast-anchor");
  if (!el) {
    el = document.createElement("div");
    el.id = "domain-toast-anchor";
    el.setAttribute("aria-live", "polite");
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    document.body.appendChild(el);
  }
  return el;
}

export default function DomainNotification() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    _notifyFn = (message, type) => {
      const id = Date.now() + Math.random();
      const duration = type === "danger" ? 3200 : 1500;
      setNotes((prev) => {
        const next = prev.length >= 2 ? prev.slice(1) : prev;
        return [...next, { id, message, type, visible: false }];
      });
      setTimeout(() => {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, visible: true } : n))
        );
      }, 10);
      setTimeout(() => {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, visible: false } : n))
        );
        setTimeout(() => {
          setNotes((prev) => prev.filter((n) => n.id !== id));
        }, 300);
      }, duration);
    };
    return () => {
      _notifyFn = null;
    };
  }, []);

  const layer = (
    <div
      className="pointer-events-none fixed right-5 top-5 flex max-w-[min(400px,calc(100vw-2.5rem))] flex-col gap-3 isolate"
      style={{ zIndex: 1 }}
    >
      {notes.map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto relative break-words rounded-xl border-l-4 px-5 py-4 font-medium shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] transition-all duration-300 ease-in-out ${
            n.visible ? "translate-x-0" : "translate-x-full"
          } ${
            n.type === "danger"
              ? "border-l-red-500 bg-red-50 text-red-800"
              : "border-l-green-500 bg-green-50 text-green-800"
          }`}
        >
          {n.message}
        </div>
      ))}
    </div>
  );

  const anchor = getDomainToastAnchor();
  if (!anchor) return null;
  return createPortal(layer, anchor);
}
