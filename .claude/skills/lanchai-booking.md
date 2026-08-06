# LANCHAI — Booking Skill

## Modèle de réservation
- **Type** : dates de début/fin + quantité
- **Unité** : journée complète (startDate à 00:00, endDate à 23:59)
- **Contrainte principale** : stock disponible sur la période demandée

---

## États d'une réservation

```
pending → confirmed → active → completed
                    ↘ cancelled
```

| Statut | Déclencheur |
|--------|------------|
| `pending` | Client soumet la demande |
| `confirmed` | Admin valide (ou auto-confirmation si stock ok) |
| `active` | Date de début atteinte |
| `completed` | Date de fin passée |
| `cancelled` | Client ou admin annule |

---

## Logique de disponibilité

### Calcul du stock disponible sur une période

```typescript
// utils/availability.ts
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/config/firebase";

export async function getAvailableStock(
  productId: string,
  startDate: Date,
  endDate: Date,
  totalStock: number
): Promise<number> {
  const bookingsRef = collection(db, "bookings");
  const q = query(
    bookingsRef,
    where("productId", "==", productId),
    where("status", "in", ["pending", "confirmed", "active"]),
    where("startDate", "<=", endDate),
    where("endDate", ">=", startDate)
  );

  const snapshot = await getDocs(q);
  const reservedQuantity = snapshot.docs.reduce(
    (sum, doc) => sum + doc.data().quantity,
    0
  );

  return Math.max(0, totalStock - reservedQuantity);
}
```

### Calcul du prix total

```typescript
// utils/pricing.ts
export function calculateTotalPrice(
  pricePerDay: number,
  startDate: Date,
  endDate: Date,
  quantity: number
): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
  return pricePerDay * days * quantity;
}
```

---

## Création d'une réservation

```typescript
// hooks/useCreateBooking.ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/config/firebase";
import { getAvailableStock } from "@/utils/availability";
import { calculateTotalPrice } from "@/utils/pricing";

export async function createBooking(params: {
  product: Product;
  startDate: Date;
  endDate: Date;
  quantity: number;
  notes?: string;
}) {
  const { product, startDate, endDate, quantity, notes } = params;
  const user = auth.currentUser;
  if (!user) throw new Error("Non authentifié");

  // Vérification du stock
  const available = await getAvailableStock(
    product.id,
    startDate,
    endDate,
    product.stock
  );
  if (available < quantity) {
    throw new Error(`Stock insuffisant. Disponible : ${available}`);
  }

  const totalPrice = calculateTotalPrice(
    product.pricePerDay,
    startDate,
    endDate,
    quantity
  );

  const bookingData = {
    userId: user.uid,
    productId: product.id,
    productName: product.name,
    startDate,
    endDate,
    quantity,
    totalPrice,
    currency: product.currency,
    status: "pending",
    paymentStatus: "unpaid",
    notes: notes || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "bookings"), bookingData);
  return docRef.id;
}
```

---

## Annulation d'une réservation

```typescript
// Règle métier : annulation possible si status = "pending" ou "confirmed"
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function cancelBooking(bookingId: string) {
  const bookingRef = doc(db, "bookings", bookingId);
  await updateDoc(bookingRef, {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });
}
```

---

## Formulaire de réservation (BookingForm)

### Champs requis
| Champ | Type | Validation |
|-------|------|-----------|
| `startDate` | Date | ≥ aujourd'hui |
| `endDate` | Date | ≥ startDate |
| `quantity` | number | ≥ 1, ≤ stock disponible |
| `notes` | string | Optionnel, max 500 chars |

### Ordre des étapes dans le formulaire
1. Sélection des dates (DatePicker)
2. Sélection de la quantité (afficher le stock dispo)
3. Récapitulatif avec prix total calculé
4. Confirmation → appel `createBooking()`
5. Redirect vers `/booking/confirmation`

---

## Hook — réservations de l'utilisateur

```typescript
// hooks/useUserBookings.ts
import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/config/firebase";

export function useUserBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "bookings"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking)));
      setLoading(false);
    });

    return unsub;
  }, []);

  return { bookings, loading };
}
```

---

## Règles métier importantes

- Un produit avec `available: false` ne peut pas être réservé, même si le stock calculé est > 0
- La quantité d'une réservation ne peut pas être modifiée après création → annuler et recréer
- Le prix total est calculé côté client mais doit être re-vérifié côté admin avant confirmation
- Les dates sont stockées en **UTC** dans Firestore — afficher en heure locale (UTC+7 pour Laos)

---

## Constantes utiles

```typescript
// constants/booking.ts
export const BOOKING_STATUS_LABELS = {
  pending: "En attente",
  confirmed: "Confirmée",
  active: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
} as const;

export const BOOKING_STATUS_COLORS = {
  pending: "#F4B400",      // yellow LANCHAI
  confirmed: "#4CAF50",
  active: "#2196F3",
  completed: "#888888",
  cancelled: "#F44336",
} as const;

export const LAOS_TIMEZONE_OFFSET = 7; // UTC+7
```
