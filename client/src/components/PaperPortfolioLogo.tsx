interface Props {
  size?: number;
  className?: string;
}

export default function PaperPortfolioLogo({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 112"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="pp-teal" x1="5" y1="108" x2="50" y2="5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#007a6e" />
          <stop offset="1" stopColor="#00d4be" />
        </linearGradient>
        <linearGradient id="pp-red" x1="95" y1="5" x2="55" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff4f4f" />
          <stop offset="1" stopColor="#991111" />
        </linearGradient>
      </defs>

      {/* Teal: house/shield shape on the left */}
      <path
        d="M 5 108 L 5 50 L 42 5 L 66 32 L 52 32 L 52 108 Z"
        fill="url(#pp-teal)"
      />

      {/* Red: triangle/arrow shape on the right, overlapping */}
      <path
        d="M 38 108 L 38 40 L 70 5 L 95 30 L 95 108 Z"
        fill="url(#pp-red)"
      />
    </svg>
  );
}
