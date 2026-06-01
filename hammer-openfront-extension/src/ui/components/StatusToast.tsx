import { useState, useEffect } from "react";
import { useStore } from "@store/index";
import { notifPositionStyle } from "@shared/notif-position";

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
  const scale = useStore((s) => s.statusToastScale);
  const position = useStore((s) => s.statusPosition);
  _setMsg = setMsg;

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.dur);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;

  return (
    <div
      className="font-mono text-base text-hammer-green pointer-events-none font-bold"
      style={{
        ...notifPositionStyle(position, scale),
        backgroundColor: "rgba(0, 0, 0, 0.92)",
        padding: "12px 24px",
        borderRadius: "6px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {msg.text}
    </div>
  );
}
