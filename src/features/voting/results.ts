export function resultBarWidth(percentage: number) {
  if (!Number.isFinite(percentage)) return "0%";
  return `${Math.min(100, Math.max(0, percentage))}%`;
}

export function formatPercentage(percentage: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(percentage);
}
