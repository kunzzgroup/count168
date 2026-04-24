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
    <div className="notification-container" style={{ zIndex: 2147483647 }}>
      {notes.map((n) => (
        <div
          key={n.id}
          className={`notification notification-${n.type}${n.visible ? " show" : ""}`}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
}
