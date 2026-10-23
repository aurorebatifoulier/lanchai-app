import LegalScreen from '@/components/LegalScreen';
import { CANCELLATION_TERMS_MARKDOWN } from '@/lib/legalContent';

export default function CancellationScreen() {
  return <LegalScreen title="Cancellation policy" content={CANCELLATION_TERMS_MARKDOWN} />;
}
