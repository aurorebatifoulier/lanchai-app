# LANCHAI — Navigation Skill

## Stack de navigation
- **Librairie** : Expo Router (basé sur React Navigation)
- **Structure** : Tab Navigator principal + Stack Navigators par section

---

## Arborescence des écrans

```
app/
├── (auth)/
│   ├── login.tsx
│   └── register.tsx
│
├── (tabs)/
│   ├── _layout.tsx              # Tab navigator
│   ├── index.tsx                # Accueil — catalogue produits
│   ├── bookings.tsx             # Mes réservations
│   ├── explore.tsx              # Parcourir par catégorie
│   └── profile.tsx             # Profil utilisateur
│
├── product/
│   └── [id].tsx                 # Détail produit (dynamic route)
│
├── booking/
│   ├── new.tsx                  # Formulaire nouvelle réservation
│   ├── [id].tsx                 # Détail d'une réservation
│   └── confirmation.tsx        # Confirmation post-réservation
│
└── _layout.tsx                  # Root layout (auth guard)
```

---

## Tab Navigator — configuration

```typescript
// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const YELLOW = "#F4B400";
const BLACK = "#000000";
const GREY = "#888888";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: YELLOW,
        tabBarInactiveTintColor: GREY,
        tabBarStyle: {
          backgroundColor: BLACK,
          borderTopColor: "#222",
        },
        headerStyle: { backgroundColor: BLACK },
        headerTintColor: "#FFFFFF",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explorer",
          tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Réservations",
          tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

---

## Auth Guard (Root Layout)

```typescript
// app/_layout.tsx
import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function RootLayout() {
  const { user, loading } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) router.replace("/(auth)/login");
    if (user && inAuth) router.replace("/(tabs)");
  }, [user, loading]);

  return <Slot />;
}
```

---

## Navigation entre écrans

### Vers le détail d'un produit
```typescript
import { router } from "expo-router";
router.push(`/product/${productId}`);
```

### Vers le formulaire de réservation
```typescript
router.push({ pathname: "/booking/new", params: { productId } });
```

### Après confirmation de réservation
```typescript
router.replace("/booking/confirmation");
// ou avec les détails :
router.replace({ pathname: "/booking/confirmation", params: { bookingId } });
```

### Retour arrière
```typescript
router.back();
```

---

## Conventions de nommage

| Pattern | Usage |
|---------|-------|
| `(tabs)/` | Écrans avec barre de navigation |
| `(auth)/` | Écrans sans barre (login, register) |
| `[id].tsx` | Route dynamique |
| `_layout.tsx` | Layout/navigator parent |

---

## Paramètres de navigation (types)

```typescript
// types/navigation.ts
export type ProductParams = {
  id: string;
};

export type BookingNewParams = {
  productId: string;
  startDate?: string;
  endDate?: string;
};

export type BookingConfirmationParams = {
  bookingId: string;
};
```
