import LegalScreen from '@/components/LegalScreen';
import { TERMS_MARKDOWN } from '@/lib/legalContent';

export default function TermsScreen() {
  return <LegalScreen title="Terms of Service" content={TERMS_MARKDOWN} />;
}
