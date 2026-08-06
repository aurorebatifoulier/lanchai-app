# LANCHAI — Admin Skill (Back Office)

## Rôle admin
- Défini dans Firestore : `users/{uid}.role === "admin"`
- Accès protégé côté navigation : redirect si role !== "admin"
- Aurore est le seul admin pour l'instant

---

## Arborescence écrans admin

```
app/
├── admin/
│   ├── _layout.tsx          # Admin layout + guard role
│   ├── index.tsx            # Dashboard (stats générales)
│   ├── products/
│   │   ├── index.tsx        # Liste tous les produits
│   │   ├── new.tsx          # Ajouter un produit
│   │   └── [id].tsx         # Modifier / supprimer un produit
│   ├── bookings/
│   │   ├── index.tsx        # Liste toutes les réservations
│   │   └── [id].tsx         # Détail + changer statut
│   └── users/
│       └── index.tsx        # Liste utilisateurs
```

---

## Guard admin (Admin Layout)

```typescript
// app/admin/_layout.tsx
import { useEffect } from "react";
import { Slot, useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function AdminLayout() {
  const { user, role, loading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || role !== "admin") router.replace("/(tabs)");
  }, [user, role, loading]);

  return <Slot />;
}
```

---

## Dashboard — données affichées

```typescript
// app/admin/index.tsx — métriques à afficher
{
  totalProducts: number,        // produits actifs
  pendingBookings: number,      // réservations en attente
  activeBookings: number,       // réservations en cours
  totalUsers: number,           // utilisateurs inscrits
  revenueThisMonth: number,     // somme totalPrice des bookings "completed" du mois
}
```

---

## Gestion des produits

### Champs modifiables
| Champ | Type | Remarque |
|-------|------|----------|
| `name` | string | Obligatoire |
| `description` | string | Obligatoire |
| `category` | string | Liste prédéfinie |
| `pricePerDay` | number | En LAK ou USD |
| `currency` | "LAK" \| "USD" | |
| `images` | string[] | URLs Firebase Storage |
| `available` | boolean | Activer/désactiver la location |
| `stock` | number | Quantité totale |
| `tags` | string[] | Pour filtres/recherche |

### Catégories prédéfinies LANCHAI
```typescript
export const PRODUCT_CATEGORIES = [
  "transport",      // vélos, scooters, voitures
  "maison",         // électroménager, meubles
  "électronique",   // caméras, ordinateurs, téléphones
  "sport",          // équipements sportifs
  "événement",      // sono, déco, mobilier événementiel
  "autre",
] as const;
```

### Actions admin sur un produit
- ✅ Créer
- ✅ Modifier tous les champs
- ✅ Activer / désactiver (`available`)
- ✅ Supprimer (uniquement si aucune réservation active liée)

---

## Gestion des réservations

### Actions admin sur une réservation
| Action | Condition |
|--------|-----------|
| `pending → confirmed` | Stock vérifié |
| `confirmed → cancelled` | Avant startDate |
| `active → completed` | Manuel si besoin |
| Modifier les notes | Toujours possible |
| Modifier paymentStatus | Toujours possible |

### Vue liste — colonnes affichées
- Nom du produit
- Nom du client
- Dates (start → end)
- Quantité
- Prix total
- Statut (badge coloré)
- Action rapide (Confirmer / Annuler)

---

## Gestion des utilisateurs

### Actions admin
- Voir la liste (email, nom, date inscription)
- Changer le rôle (`customer` ↔ `admin`)
- Voir les réservations d'un utilisateur

### ⚠️ Pas de suppression d'utilisateur depuis l'app
La suppression Auth se fait depuis la console Firebase.

---

## Navigation vers le back office

### Depuis le profil utilisateur (si admin)
```typescript
// app/(tabs)/profile.tsx
if (role === "admin") {
  <TouchableOpacity onPress={() => router.push("/admin")}>
    <Text>Accès administration</Text>
  </TouchableOpacity>
}
```

---

## Hook — stats dashboard

```typescript
// hooks/useAdminStats.ts
import { collection, query, where, getDocs, getCountFromServer } from "firebase/firestore";
import { db } from "@/config/firebase";

export async function getAdminStats() {
  const [products, pending, active, users] = await Promise.all([
    getCountFromServer(query(collection(db, "products"), where("available", "==", true))),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "pending"))),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "active"))),
    getCountFromServer(collection(db, "users")),
  ]);

  return {
    totalProducts: products.data().count,
    pendingBookings: pending.data().count,
    activeBookings: active.data().count,
    totalUsers: users.data().count,
  };
}
```

---

## Règles métier importantes

- Un produit ne peut pas être supprimé s'il a des bookings `pending`, `confirmed` ou `active`
- Désactiver un produit (`available: false`) ne cancelle pas les réservations existantes
- Le rôle admin est vérifié côté Firestore ET côté navigation
- Toujours mettre à jour `updatedAt: serverTimestamp()` lors d'une modification
