"use client";

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="relative inline-block w-9 h-5.25 shrink-0 cursor-pointer">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="absolute inset-0 rounded-full bg-(--line-strong) transition-colors duration-150 peer-checked:bg-(--accent) after:absolute after:left-0.75 after:top-0.75 after:h-3.75 after:w-3.75 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-150 after:content-[''] peer-checked:after:translate-x-3.75" />
    </label>
  );
}
