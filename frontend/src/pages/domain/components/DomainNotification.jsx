import { useEffect, useState } from "react";

let _notifyFn = null;

/** Call this from anywhere to show a notification */
export function showDomainAlert(message, type = "success") {
  if (_notifyFn) _notifyFn(message, type);
}

export default function DomainNotification() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    _notifyFn = (message, type) => {
      const id = Date.now() + Math.random();
      setNotes((prev) => {
        const next = prev.length >= 2 ? prev.slice(1) : prev;
        return [...next, { id, message, type, visible: false }];
      });
      // trigger show
      setTimeout(() => {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, visible: true } : n))
        );
      }, 10);
      // hide after 1500ms
      setTimeout(() => {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, visible: false } : n))
        );
        // remove after fade
        setTimeout(() => {
          setNotes((prev) => prev.filter((n) => n.id !== id));
        }, 300);
      }, 1500);
    };
    return () => { _notifyFn = null; };
  }, []);

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[2147483647] flex max-w-[400px] flex-col gap-3 isolate">
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
}
