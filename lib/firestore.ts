import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_PRODUCTS, MOCK_RESERVATIONS, Product, Reservation, ProductCategory } from './mockData';

const USE_MOCK = true; // Set to false once Firebase is configured with real data

export async function getProducts(): Promise<Product[]> {
  if (USE_MOCK) return MOCK_PRODUCTS;
  try {
    const snap = await getDocs(collection(db, 'products'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  } catch {
    return MOCK_PRODUCTS;
  }
}

export async function getProductsByCategory(category: ProductCategory): Promise<Product[]> {
  if (USE_MOCK) return MOCK_PRODUCTS.filter(p => p.category === category);
  try {
    const q = query(collection(db, 'products'), where('category', '==', category));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  } catch {
    return MOCK_PRODUCTS.filter(p => p.category === category);
  }
}

export async function getProduct(id: string): Promise<Product | null> {
  if (USE_MOCK) return MOCK_PRODUCTS.find(p => p.id === id) ?? null;
  try {
    const snap = await getDoc(doc(db, 'products', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Product;
  } catch {
    return MOCK_PRODUCTS.find(p => p.id === id) ?? null;
  }
}

export async function getReservations(userId: string = 'user1'): Promise<Reservation[]> {
  if (USE_MOCK) return MOCK_RESERVATIONS.filter(r => r.userId === userId);
  try {
    const q = query(
      collection(db, 'reservations'),
      where('userId', '==', userId),
      orderBy('startDate', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
  } catch {
    return MOCK_RESERVATIONS;
  }
}

export async function createReservation(data: Omit<Reservation, 'id'>): Promise<string> {
  if (USE_MOCK) {
    return 'LCH-2026-' + Math.floor(10000 + Math.random() * 90000);
  }
  try {
    const ref = await addDoc(collection(db, 'reservations'), {
      ...data,
      createdAt: Timestamp.now(),
    });
    return ref.id;
  } catch {
    return 'LCH-2026-' + Math.floor(10000 + Math.random() * 90000);
  }
}
