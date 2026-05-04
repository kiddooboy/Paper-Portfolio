interface Props {
  size?: number;
  className?: string;
}

export default function PaperPortfolioLogo({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="pp-teal" x1="8" y1="90" x2="58" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00a896" />
          <stop offset="1" stopColor="#00ede2" />
        </linearGradient>
        <linearGradient id="pp-red" x1="60" y1="20" x2="88" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff5555" />
          <stop offset="1" stopColor="#b51c1c" />
        </linearGradient>
      </defs>

      {/* Teal: left column rising through S-wave to upward arrow */}
      <path
        d="M 8 90
           L 8 48
           C 8 36 14 28 24 20
           L 48 6
           L 62 20
           C 52 28 46 38 46 50
           C 46 58 50 64 50 72
           L 50 90
           Z"
        fill="url(#pp-teal)"
      />

      {/* Red: right arc completing the shape */}
      <path
        d="M 62 20
           C 70 12 82 14 86 26
           L 86 72
           C 86 84 78 92 66 90
           L 50 90
           C 50 72 50 64 46 50
           C 46 38 52 28 62 20
           Z"
        fill="url(#pp-red)"
      />
    </svg>
  );
}
