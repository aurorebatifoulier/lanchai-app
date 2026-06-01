export function calculateTotalPrice(
  pricePerDay: number,
  startDate: Date,
  endDate: Date,
  quantity: number
): number {
  const days = calculateDays(startDate, endDate);
  return pricePerDay * days * quantity;
}

export function calculateDays(startDate: Date, endDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
}
