import { Redirect, useLocalSearchParams } from 'expo-router';

// "Summary" was merged into "Your booking" (app/booking/new.tsx). Old links land there.
export default function BookingSummaryRedirect() {
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  return productId
    ? <Redirect href={{ pathname: '/booking/new', params: { productId } }} />
    : <Redirect href="/(tabs)/explore" />;
}
