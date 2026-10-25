type NahreoMarkProps = {
  className?: string;
  inverse?: boolean;
  monochrome?: boolean;
  title?: string;
};

export function NahreoMark({
  className,
  inverse = false,
  monochrome = false,
  title,
}: NahreoMarkProps) {
  const orbit = inverse || monochrome ? "currentColor" : "#173F8A";
  const coral = monochrome ? "currentColor" : "#FF6B5E";

  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M17 59.5V28.8C17 22.3 22.3 17 28.8 17h27.8"
        stroke={orbit}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M29.5 63h21.7C58.3 63 64 57.3 64 50.2V34"
        stroke={orbit}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M47.5 17H63.5V33"
        stroke={coral}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M33 45.5L46 32.5"
        stroke={orbit}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type NahreoBrandProps = NahreoMarkProps & {
  markClassName?: string;
  wordmarkClassName?: string;
};

export function NahreoBrand({
  className,
  markClassName = "h-8 w-8",
  wordmarkClassName,
  inverse,
  monochrome,
}: NahreoBrandProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <NahreoMark
        className={`shrink-0 ${markClassName}`}
        inverse={inverse}
        monochrome={monochrome}
      />
      <span
        className={`font-display font-extrabold tracking-[-0.065em] ${wordmarkClassName ?? ""}`}
      >
        Nahreo
      </span>
    </span>
  );
}