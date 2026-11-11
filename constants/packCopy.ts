// Every bookable-pack string (pack page, Home "Packs", admin) — edit here only. Sentence case.
export const PACK_COPY = {
  homeTitle: 'Packs',
  homeSub: 'Everything you need, together — for less.',
  chip: (pct: number) => `−${pct}%`,

  items: 'What’s inside',
  perDay: (lak: string) => `${lak} LAK / day`,
  qty: (n: number) => `× ${n}`,
  totalPerDay: 'Total per day',
  packPricePerDay: (pct: number) => `Pack price per day (−${pct}%)`,
  forDates: 'For your dates',
  total: 'Total',
  packPrice: (pct: number) => `Pack price (−${pct}%)`,
  deposit: 'Refundable deposit',
  depositNote: 'Given back at return. The pack price applies to the rental, not the deposit.',
  how: 'Pick your dates: every item is added to your bag for the same dates. The pack price applies at checkout.',

  book: 'Book this pack',
  changeDates: 'Change dates',
  checking: 'Checking each item…',
  free: 'Free on these dates',
  notFree: 'Not free on these dates',
  addPack: 'Add pack to bag',
  addSome: (n: number) => `Add the ${n} available ${n === 1 ? 'item' : 'items'}`,
  someMissing: 'The pack price needs every item — the available ones are added at their normal price.',
  noneFree: 'None of these items is free on these dates. Try other dates.',
  addError: 'Couldn’t add the items to your bag — try again.',
  unavailable: 'This pack isn’t available right now.',

  // Before cancelling one item of a pack (renter + staff): the pack price goes away.
  cancelNote: (title: string, n: number) =>
    `This item is part of the ${title} pack. Cancelling it removes the pack price — your other ${n === 1 ? 'item' : `${n} items`}:`,
  cancelNoteStaff: (title: string, n: number) =>
    `Part of the ${title} pack: cancelling this line removes the pack price on the other ${n === 1 ? 'line' : `${n} lines`}:`,
  cancelAmounts: 'LAK to pay at pick-up',
} as const;
