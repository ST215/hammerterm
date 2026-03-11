import { useState, useEffect } from "react";
import { useStore } from "@store/index";

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
  _setMsg = setMsg;

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.dur);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;

  return (
    <div
      className="fixed font-mono text-base text-hammer-green pointer-events-none font-bold"
      style={{
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "center center",
        backgroundColor: "rgba(0, 0, 0, 0.92)",
        padding: "12px 24px",
        borderRadius: "6px",
        zIndex: 2147483647,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {msg.text}
    </div>
  );
}
