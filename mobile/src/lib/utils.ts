export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(num: number): string {
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

export function formatCompact(num: number): string {
  if (num >= 1e7) return (num / 1e7).toFixed(2) + ' Cr';
  if (num >= 1e5) return (num / 1e5).toFixed(2) + ' L';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + ' K';
  return num.toString();
}
