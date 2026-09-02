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
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M20 57.5C20 36.5 35.8 21 56 21c9.5 0 17.9 3.4 24.4 9.5"
        stroke={orbit}
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M80 42.5C80 63.5 64.2 79 44 79c-9.5 0-17.9-3.4-24.4-9.5"
        stroke={orbit}
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M72.7 26.2 79.9 31.5 76.2 39.2"
        stroke={coral}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m27.3 73.8-7.2-5.3 3.7-7.7"
        stroke={coral}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="50" r="7" fill={coral} />
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