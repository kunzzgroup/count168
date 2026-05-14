import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

let _notifyFn = null;

/** Call this from anywhere to show a notification */
export function showDomainAlert(message, type = "success") {
  if (_notifyFn) _notifyFn(message, type);
}

/** Must stay above DomainModalPortal overlays (e.g. form modal inline z-index 2147483000) */
const TOAST_Z = 2147483647;

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
      className="pointer-events-none fixed right-5 top-5 flex max-w-[400px] flex-col gap-3 isolate"
      style={{ zIndex: TOAST_Z }}
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

  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(layer, document.body);
}
