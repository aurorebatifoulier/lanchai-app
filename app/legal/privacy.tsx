import LegalScreen from '@/components/LegalScreen';
import { PRIVACY_MARKDOWN } from '@/lib/legalContent';

export default function PrivacyScreen() {
  return <LegalScreen title="Privacy policy" content={PRIVACY_MARKDOWN} />;
}
