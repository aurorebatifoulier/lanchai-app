import LegalScreen from '@/components/LegalScreen';
import { PRIVACY_MARKDOWN } from '@/lib/legalContent';

export default function PrivacyScreen() {
  return <LegalScreen title="Privacy Policy" content={PRIVACY_MARKDOWN} />;
}
