// Rental agreement — every screen string (staff signing flow, admin detail, renter
// button) — edit here only. Sentence case. The document's own wording lives in
// functions/src/shared/rentalAgreement.ts (AGREEMENT_COPY, shared with the email).
export const AGREEMENT_UI = {
  section: 'Rental agreement',
  intro: 'The renter reads and signs the agreement on this device before the handover.',
  notReady: 'Complete the ID check, the condition report and the deposit currency first.',
  review: 'Review & sign',
  paper: 'Signed on paper',
  signed: (when: string) => `Signed · ${when}`,
  signedPaper: (when: string) => `Signed on paper · ${when}`,
  signAgain: 'Sign again',
  required: 'The renter must sign the rental agreement before the handover.',

  // Signing screen
  title: 'Rental agreement',
  loading: 'Preparing the agreement…',
  signHere: 'Renter’s signature',
  signHint: 'Sign with your finger in the box.',
  clear: 'Clear',
  confirm: 'Confirm',
  saving: 'Saving…',
  close: 'Close',

  // Paper fallback
  paperAsk: 'Use the paper form? Print it from the reservation (Print agreement), have the renter sign it, then take a photo of every page.',
  paperAdd: 'Take a photo',
  paperSave: 'Save paper agreement',
  paperPages: (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`,

  // Admin reservation detail
  adminTitle: 'Rental agreement',
  adminNone: 'Not signed yet — it’s signed during the pick-up checklist.',
  adminBy: (name: string) => `Recorded by ${name}`,
  adminEmailed: 'Sent to the renter by email',
  adminNotEmailed: 'Email not sent',
  open: 'Open PDF',
  print: 'Print agreement',

  // Renter
  renterButton: 'Agreement',

  errors: {
    generic: 'Couldn’t save the agreement. Please try again.',
    open: 'Couldn’t open the agreement. Please try again.',
    share: 'Sharing isn’t available on this device.',
  },
} as const;
