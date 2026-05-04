interface Props {
  size?: number;
  className?: string;
}

export default function PaperPortfolioLogo({ size = 24, className }: Props) {
  return (
    <img
      src="/favicon.png"
      alt="Paper Portfolio"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
