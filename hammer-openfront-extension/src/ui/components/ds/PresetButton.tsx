interface PresetButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export default function PresetButton({ label, active, onClick }: PresetButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-1_5 py-0_5 rounded text-2xs border transition-colors cursor-pointer ${
        active
          ? "bg-hammer-green/20 text-hammer-green border-hammer-green/40"
          : "bg-hammer-surface text-hammer-muted border-hammer-border hover:text-hammer-text hover:border-hammer-border-strong"
      }`}
    >
      {label}
    </button>
  );
}
