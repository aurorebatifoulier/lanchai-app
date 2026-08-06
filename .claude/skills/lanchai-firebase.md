# LANCHAI — Firebase Skill

## Projet Firebase
- **Nom** : lanchai-app
- **Région** : asia-southeast1
- **Services** : Firestore, Auth (Email/Password)

---

## Collections Firestore

### `products`
```
{
  id: string,                      // auto-généré
  name: string,                    // ex: "Vélo de ville"
  description: string,
  category: string,                // ex: "transport", "maison", "électronique"
  pricePerDay: number,             // en LAK ou USD selon config
  currency: "LAK" | "USD",
  images: string[],                // URLs Firebase Storage
  available: boolean,
  stock: number,                   // quantité totale disponible
  tags: string[],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `bookings`
```
{
  id: string,
  userId: string,                  // ref → users/{id}
  productId: string,               // ref → products/{id}
  productName: string,             // dénormalisé pour affichage rapide
  startDate: Timestamp,
  endDate: Timestamp,
  quantity: number,
  totalPrice: number,
  currency: "LAK" | "USD",
  status: "pending" | "confirmed" | "active" | "completed" | "cancelled",
  paymentStatus: "unpaid" | "paid" | "refunded",
  notes: string,                   // remarques client
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `users`
```
{
  id: string,                      // = Firebase Auth UID
  email: string,
  displayName: string,
  phone: string,
  nationality: string,             // utile pour expats/touristes
  preferredLanguage: "fr" | "en" | "lo",
  role: "customer" | "admin",
  createdAt: Timestamp,
  lastLogin: Timestamp
}
```

### `reviews`
```
{
  id: string,
  userId: string,
  productId: string,
  bookingId: string,               // lié à une réservation terminée
  rating: number,                  // 1–5
  comment: string,
  createdAt: Timestamp
}
```

---

## Règles de sécurité (Firestore Rules)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Products : lecture publique, écriture admin seulement
    match /products/{productId} {
      allow read: if true;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }

    // Bookings : lecture/écriture par le propriétaire ou admin
    match /bookings/{bookingId} {
      allow read, write: if request.auth != null &&
        (request.auth.uid == resource.data.userId ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin");
      allow create: if request.auth != null;
    }

    // Users : lecture/écriture de son propre document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Reviews : lecture publique, création par auth uniquement
    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

---

## Requêtes courantes

### Produits disponibles
```javascript
const q = query(
  collection(db, "products"),
  where("available", "==", true),
  orderBy("name")
);
```

### Vérifier la disponibilité d'un produit sur une période
```javascript
// Récupérer les bookings actifs qui chevauchent la période demandée
const q = query(
  collection(db, "bookings"),
  where("productId", "==", productId),
  where("status", "in", ["pending", "confirmed", "active"]),
  where("startDate", "<=", requestedEndDate),
  where("endDate", ">=", requestedStartDate)
);
// Puis sommer les quantités et comparer au stock
```

### Réservations d'un utilisateur
```javascript
const q = query(
  collection(db, "bookings"),
  where("userId", "==", currentUser.uid),
  orderBy("createdAt", "desc")
);
```

### Reviews d'un produit
```javascript
const q = query(
  collection(db, "reviews"),
  where("productId", "==", productId),
  orderBy("createdAt", "desc")
);
```

---

## Config Firebase (firebase.js)
```javascript
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  // Valeurs dans .env ou app.config.js — NE PAS committer en dur
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: "lanchai-app",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```
