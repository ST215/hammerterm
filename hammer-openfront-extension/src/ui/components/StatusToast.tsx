import { useState, useEffect } from "react";

interface ToastMessage {
  text: string;
  dur: number;
}

let _setMsg: ((m: ToastMessage | null) => void) | null = null;

export function showStatus(text: string, duration = 2000) {
  _setMsg?.({ text, dur: duration });
}

export default function StatusToast() {
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  _setMsg = setMsg;

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.dur);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;

  return (
    <div
      className="fixed font-mono text-sm text-hammer-green pointer-events-none"
      style={{
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        padding: "8px 16px",
        borderRadius: "4px",
        zIndex: 2147483647,
      }}
    >
      {msg.text}
    </div>
  );
}
