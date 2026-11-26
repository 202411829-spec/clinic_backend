// src/components/ui/AnimatedCheckbox.jsx
// GC-RFB animated checkbox design. The native input remains the source of
// truth; the SVG is presentation only. No state or validation is added here.
export default function AnimatedCheckbox({
  className = "",
  boxClassName = "",
  inputClassName = "",
  disabled = false,
  style,
  ...props
}) {
  return (
    <span
      className={`gc-checkbox ${disabled ? "is-disabled" : ""} ${boxClassName}`.trim()}
      style={style}
    >
      <input
        type="checkbox"
        disabled={disabled}
        className={`gc-checkbox-input ${inputClassName} ${className}`.trim()}
        {...props}
      />
      <span className="gc-checkbox-ui" aria-hidden="true">
        <svg viewBox="0 0 18 18" focusable="false">
          <path d="M1,9 L1,3.5 C1,2 2,1 3.5,1 L14.5,1 C16,1 17,2 17,3.5 L17,14.5 C17,16 16,17 14.5,17 L3.5,17 C2,17 1,16 1,14.5 L1,9 Z" />
          <polyline points="1 9 7 14 15 4" />
        </svg>
      </span>
    </span>
  )
}
