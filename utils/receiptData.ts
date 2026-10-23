// Re-export — the receipt math now lives in functions/src/shared/receiptData.ts so the
// receipt email (Cloud Functions) uses the exact same figures as the app's on-screen
// receipt and PDF. Import from here in app code.
export {
  deriveReceiptData, deriveSettlementOutcome, type ReceiptData, type SettlementOutcome,
} from '@/functions/src/shared/receiptData';
