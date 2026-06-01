import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function getAvailableStock(
  productId: string,
  startDate: Date,
  endDate: Date,
  totalStock: number
): Promise<number> {
  try {
    const q = query(
      collection(db, 'bookings'),
      where('productId', '==', productId),
      where('status', 'in', ['pending', 'confirmed', 'active']),
      where('startDate', '<=', endDate),
      where('endDate', '>=', startDate)
    );
    const snap = await getDocs(q);
    const reserved = snap.docs.reduce((sum, d) => sum + (d.data().quantity ?? 0), 0);
    return Math.max(0, totalStock - reserved);
  } catch {
    return totalStock;
  }
}
