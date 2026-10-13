type BrandLoaderProps = {
  size?: "inline" | "small" | "page";
  label?: string;
  showLabel?: boolean;
};

/** Separate transparent logo pieces share one gentle assembly animation. */
export function BrandLoader({ size = "small", label = "Loading…", showLabel = false }: BrandLoaderProps) {
  return (
    <span
      className={`brand-loader brand-loader--${size}`}
      role={label ? "status" : undefined}
      aria-label={label || undefined}
      aria-hidden={!label || undefined}
    >
      <svg className="brand-loader__icon" viewBox="-6 -6 112 112" aria-hidden="true" focusable="false">
        <g className="brand-loader__piece brand-loader__roof">
          <image href="/images/elayo/loader/roof.webp" x="0" y="0" width="100" height="61" />
        </g>
        <g className="brand-loader__piece brand-loader__family">
          <image href="/images/elayo/loader/family.webp" x="18" y="16" width="66" height="47" />
        </g>
        <g className="brand-loader__piece brand-loader__savings">
          <image href="/images/elayo/loader/savings.webp" x="34" y="48" width="33" height="33" />
        </g>
        <g className="brand-loader__piece brand-loader__hands">
          <image href="/images/elayo/loader/hands.webp" x="9" y="65" width="82" height="36" />
        </g>
      </svg>
      {showLabel && (
        <span className="brand-loader__label" aria-hidden="true">
          {label}
        </span>
      )}
    </span>
  );
}

export function PageLoader({
  fullScreen = false,
  label = "Loading your workspace…",
}: {
  fullScreen?: boolean;
  label?: string;
}) {
  return (
    <div className={`page-loader${fullScreen ? " page-loader--fullscreen" : ""}`}>
      <BrandLoader size="page" label={label} showLabel />
    </div>
  );
}
