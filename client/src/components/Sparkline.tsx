// Tiny dependency-free SVG sparkline. Renders one polyline coloured by the
// day's direction (green up / red down). Designed for compact watchlist rows.

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  strokeWidth?: number;
  className?: string;
}

export default function Sparkline({
  data,
  width = 72,
  height = 24,
  positive,
  strokeWidth = 1.5,
  className = '',
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <div className={`inline-block ${className}`} style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  // Auto-detect direction if not provided.
  const up = positive ?? (data[data.length - 1] >= data[0]);
  const stroke = up ? '#10b981' : '#ef4444'; // emerald-500 / red-500
  const fill = up ? '#10b98122' : '#ef444422'; // 13% alpha

  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Area-fill path (closes the polyline to the baseline for a soft tint).
  const areaPath = `M ${points.split(' ').join(' L ')} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <path d={areaPath} fill={fill} stroke="none" />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
