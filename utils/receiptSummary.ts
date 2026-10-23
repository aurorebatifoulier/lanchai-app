// Re-export — the receipt summary lines live in functions/src/shared/receiptSummary.ts so
// the receipt email (Cloud Functions) renders exactly the same lines as the app's
// on-screen receipt and PDF. Import from here in app code.
export {
  buildReceiptSummary, type SummaryLine, type ReceiptSummary, type ReceiptSummaryInput,
} from '@/functions/src/shared/receiptSummary';
