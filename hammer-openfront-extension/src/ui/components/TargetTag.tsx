import { memo } from "react";

interface TargetTagProps {
  target: { id: string; name: string; type?: "TM" | "AL" };
  onRemove: () => void;
}

export const TargetTag = memo(function TargetTag({ target, onRemove }: TargetTagProps) {
  return (
    <span className="inline-flex items-center gap-0_5 bg-hammer-surface border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text">
      {target.type && (
        <span className={target.type === "TM" ? "text-hammer-blue" : "text-hammer-green"}>
          [{target.type}]
        </span>
      )}
      {target.name}
      <button
        onClick={onRemove}
        className="text-hammer-red hover:text-red-400 cursor-pointer ml-0_5"
        title="Remove target"
      >
        x
      </button>
    </span>
  );
});
