import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { useStore } from "@store/index";
import { SIZES } from "@shared/constants";

interface PanelProps {
  header: ReactNode;
  children: ReactNode;
}

export default function Panel({ header, children }: PanelProps) {
  const sizeIdx = useStore((s) => s.sizeIdx);
  const minimized = useStore((s) => s.minimized);
  const setPanelWidth = useStore((s) => s.setPanelWidth);

  const size = SIZES[sizeIdx];

  const [pos, setPos] = useState({ left: 20, top: 60 });
  const [manualSize, setManualSize] = useState<{ w: number; h: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      dragOffset.current = {
        x: e.clientX - pos.left,
        y: e.clientY - pos.top,
      };
      e.preventDefault();
    },
    [pos.left, pos.top],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        left: e.clientX - dragOffset.current.x,
        top: e.clientY - dragOffset.current.y,
      });
    };
    const onMouseUp = () => {
      dragging.current = false;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Track manual resize via ResizeObserver
  useEffect(() => {
    const el = panelRef.current;
    if (!el || minimized) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize (includes borders) to avoid a shrink feedback loop
        // where contentRect excludes borders, causing the panel to collapse 2px/cycle.
        const bbs = entry.borderBoxSize?.[0];
        if (!bbs) continue;
        const w = Math.round(bbs.inlineSize);
        const h = Math.round(bbs.blockSize);
        setManualSize((prev) => {
          if (prev && prev.w === w && prev.h === h) return prev;
          return { w, h };
        });
        // Publish width (rounded to 4px) for pretext layout calculations
        setPanelWidth(Math.round(w / 4) * 4);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minimized, setPanelWidth]);

  // Reset manual size when sizeIdx changes
  useEffect(() => {
    setManualSize(null);
  }, [sizeIdx]);

  const panelW = minimized ? 240 : (manualSize?.w ?? size.w);
  const panelH = minimized ? undefined : (manualSize?.h ?? size.h);
  const bodyH = minimized
    ? 0
    : manualSize
      ? manualSize.h - (size.h - size.bodyH)
      : size.bodyH;

  return (
    <div
      ref={panelRef}
      className="fixed font-mono text-base text-hammer-text bg-hammer-bg border border-hammer-border"
      style={{
        left: pos.left,
        top: pos.top,
        width: panelW,
        height: panelH,
        zIndex: 2147483647,
        overflow: "hidden",
        resize: minimized ? "none" : "both",
        minWidth: 300,
        minHeight: minimized ? undefined : 120,
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Draggable header */}
      <div
        className="flex items-center justify-between bg-hammer-header px-2 py-1 select-none"
        style={{ cursor: "move", minHeight: 28, flexShrink: 0 }}
        onMouseDown={onMouseDown}
      >
        <span className="text-hammer-green text-sm font-bold">HAMMER</span>
        <div className="flex items-center gap-1">{header}</div>
      </div>

      {/* Scrollable body */}
      {!minimized && (
        <div
          id="hm-body"
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: bodyH }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
