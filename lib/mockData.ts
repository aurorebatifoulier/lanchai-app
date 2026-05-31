export type ProductCategory =
  | 'create-grow'
  | 'clean-care'
  | 'celebrate'
  | 'explore-play'
  | 'little-ones'
  | 'move-train'
  | 'glow-relax';

export interface Product {
  id: string;
  name: string;
  shortDesc: string;
  description: string;
  category: ProductCategory;
  pricePerDay: number;
  price8to30: number;
  price30plus: number;
  deposit: number;
  rating: number;
  reviewCount: number;
  rentalCount: number;
  available: boolean;
  stockLeft: number;
  specs: {
    dimensions?: string;
    weight?: string;
    material?: string;
    condition?: string;
  };
  iconName: string;
  iconSet: 'Feather' | 'MaterialCommunityIcons' | 'Ionicons';
  cardBg: 'amber' | 'dark' | 'beige' | 'default';
  tag?: string;
  tagStyle?: 'amber' | 'dark';
}

export interface Reservation {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  productIcon: string;
  productIconSet: string;
  startDate: string;
  endDate: string;
  store: string;
  status: 'upcoming' | 'active' | 'returned' | 'cancelled';
  totalPrice: number;
  depositAmount: number;
  paidNow: number;
  payAtPickup: number;
  bookingId: string;
  cardBg: 'amber' | 'dark' | 'beige' | 'default';
  daysCurrent: number;
  daysTotal: number;
}

export const CATEGORIES = [
  { id: 'all', name: 'All', icon: 'grid', iconSet: 'Feather' as const },
  { id: 'create-grow', name: 'Create', icon: 'tool', iconSet: 'Feather' as const },
  { id: 'clean-care', name: 'Clean', icon: 'wind', iconSet: 'Feather' as const },
  { id: 'celebrate', name: 'Celebrate', icon: 'star', iconSet: 'Feather' as const },
  { id: 'explore-play', name: 'Explore', icon: 'map', iconSet: 'Feather' as const },
  { id: 'little-ones', name: 'Little Ones', icon: 'heart', iconSet: 'Feather' as const },
  { id: 'move-train', name: 'Move', icon: 'activity', iconSet: 'Feather' as const },
  { id: 'glow-relax', name: 'Glow', icon: 'sun', iconSet: 'Feather' as const },
];

export const CATEGORY_DETAILS: Record<string, { label: string; description: string; cardBg: 'amber' | 'dark' | 'beige' | 'default' }> = {
  'create-grow': { label: 'Create & Grow', description: 'Power tools, garden & DIY gear', cardBg: 'amber' },
  'clean-care': { label: 'Clean & Care', description: 'Vacuums, air purifiers & steam cleaners', cardBg: 'beige' },
  'celebrate': { label: 'Celebrate', description: 'Speakers, lights & party equipment', cardBg: 'dark' },
  'explore-play': { label: 'Explore & Play', description: 'Cameras, tents, luggage & adventure gear', cardBg: 'default' },
  'little-ones': { label: 'Little Ones', description: 'Strollers, car seats & kids essentials', cardBg: 'beige' },
  'move-train': { label: 'Move & Train', description: 'Bikes, yoga gear & fitness equipment', cardBg: 'default' },
  'glow-relax': { label: 'Glow & Relax', description: 'Massage tools, diffusers & wellness', cardBg: 'amber' },
};

export const STORES = [
  { id: 'setthathirath', name: 'Setthathirath · Downtown', address: '14 Setthathirath Rd, Vientiane', distance: '1.2 km', duration: '6 min', hours: 'Mon–Sat 9am–7pm' },
  { id: 'that-luang', name: 'That Luang · North', address: '23 Nongbone Rd, Vientiane', distance: '3.8 km', duration: '14 min', hours: 'Mon–Sat 9am–7pm' },
  { id: 'patuxay', name: 'Patuxay · East', address: '50 Souphanouvong Ave', distance: '5.4 km', duration: '18 min', hours: 'Mon–Sat 9am–7pm' },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Power Drill',
    shortDesc: 'Bosch · 18V cordless',
    description: 'Professional-grade cordless drill, perfect for home projects and renovations. Comes with a full bit set and two batteries.',
    category: 'create-grow',
    pricePerDay: 10,
    price8to30: 7,
    price30plus: 5,
    deposit: 200,
    rating: 4.8,
    reviewCount: 32,
    rentalCount: 87,
    available: true,
    stockLeft: 3,
    specs: { weight: '1.8 kg', condition: 'Excellent (9/10)', material: 'ABS + Metal' },
    iconName: 'tool',
    iconSet: 'Feather',
    cardBg: 'default',
    tag: 'POPULAR',
    tagStyle: 'amber',
  },
  {
    id: '2',
    name: 'Camping Tent',
    shortDesc: 'Coleman · 4-person',
    description: 'Spacious 4-person dome tent ideal for weekend trips and festivals. Includes rainfly, stakes and carry bag.',
    category: 'explore-play',
    pricePerDay: 15,
    price8to30: 11,
    price30plus: 8,
    deposit: 300,
    rating: 4.7,
    reviewCount: 18,
    rentalCount: 54,
    available: true,
    stockLeft: 2,
    specs: { dimensions: '270 × 270 × 155 cm', weight: '5.4 kg', condition: 'Good (8/10)' },
    iconName: 'map',
    iconSet: 'Feather',
    cardBg: 'beige',
  },
  {
    id: '3',
    name: 'Sony A7 IV',
    shortDesc: 'Full-frame mirrorless',
    description: 'Professional full-frame mirrorless camera with 33MP sensor. Includes 28-70mm kit lens, 2 batteries and memory card.',
    category: 'explore-play',
    pricePerDay: 45,
    price8to30: 34,
    price30plus: 25,
    deposit: 1000,
    rating: 5.0,
    reviewCount: 24,
    rentalCount: 63,
    available: true,
    stockLeft: 1,
    specs: { weight: '658 g', condition: 'Excellent (10/10)', material: 'Magnesium alloy' },
    iconName: 'camera',
    iconSet: 'Feather',
    cardBg: 'dark',
    tag: 'BEST SELLER',
    tagStyle: 'dark',
  },
  {
    id: '4',
    name: 'Carry-on Luggage',
    shortDesc: 'Rimowa · 36L',
    description: 'Premium polycarbonate hard-shell carry-on, TSA-approved. Perfect for weekend trips and short stays.',
    category: 'explore-play',
    pricePerDay: 8,
    price8to30: 6,
    price30plus: 4,
    deposit: 150,
    rating: 4.9,
    reviewCount: 41,
    rentalCount: 142,
    available: true,
    stockLeft: 5,
    specs: { dimensions: '56 × 36 × 23 cm', weight: '3.4 kg', condition: 'Excellent (9/10)' },
    iconName: 'briefcase',
    iconSet: 'Feather',
    cardBg: 'amber',
    tag: 'TOP PICK',
  },
  {
    id: '5',
    name: 'Nespresso Vertuo',
    shortDesc: 'Coffee machine + frother',
    description: 'Push a button, get a real espresso. Includes 20 capsules to start, Aeroccino milk frother and descaling kit.',
    category: 'clean-care',
    pricePerDay: 80,
    price8to30: 65,
    price30plus: 50,
    deposit: 800,
    rating: 4.8,
    reviewCount: 28,
    rentalCount: 78,
    available: true,
    stockLeft: 4,
    specs: { dimensions: '40 × 14 × 32 cm', weight: '3.8 kg', condition: 'Excellent (9/10)' },
    iconName: 'coffee',
    iconSet: 'Feather',
    cardBg: 'dark',
    tag: 'BEST SELLER',
    tagStyle: 'dark',
  },
  {
    id: '6',
    name: 'Scandinavian Armchair',
    shortDesc: 'Mustard yellow · premium fabric',
    description: 'Elegant, comfortable and warm — this Scandinavian armchair brings a soft, livable touch to any room. Perfect for studios, guest corners, or longer stays.',
    category: 'glow-relax',
    pricePerDay: 120,
    price8to30: 90,
    price30plus: 70,
    deposit: 800,
    rating: 4.9,
    reviewCount: 32,
    rentalCount: 142,
    available: true,
    stockLeft: 3,
    specs: { dimensions: 'L78 · D75 · H85 cm', weight: '12 kg', material: 'Premium fabric', condition: 'Excellent (9/10)' },
    iconName: 'square',
    iconSet: 'Feather',
    cardBg: 'amber',
    tag: 'POPULAR',
    tagStyle: 'amber',
  },
  {
    id: '7',
    name: 'Portable AC',
    shortDesc: 'Philips · 12,000 BTU',
    description: 'Powerful portable air conditioner. Cools rooms up to 30m². Easy setup, no permanent installation needed.',
    category: 'glow-relax',
    pricePerDay: 100,
    price8to30: 75,
    price30plus: 60,
    deposit: 1000,
    rating: 4.6,
    reviewCount: 19,
    rentalCount: 55,
    available: true,
    stockLeft: 2,
    specs: { weight: '25 kg', dimensions: '40 × 35 × 75 cm', condition: 'Good (8/10)' },
    iconName: 'wind',
    iconSet: 'Feather',
    cardBg: 'beige',
    tag: 'HOT NOW',
    tagStyle: 'amber',
  },
  {
    id: '8',
    name: 'JBL PartyBox 110',
    shortDesc: 'Portable Bluetooth speaker',
    description: 'Massive sound output for parties and events. 60-hour battery life, dynamic light show, splash-proof.',
    category: 'celebrate',
    pricePerDay: 35,
    price8to30: 26,
    price30plus: 20,
    deposit: 400,
    rating: 4.7,
    reviewCount: 23,
    rentalCount: 91,
    available: true,
    stockLeft: 3,
    specs: { weight: '3.2 kg', dimensions: '28 × 27 × 22 cm', condition: 'Excellent (9/10)' },
    iconName: 'music',
    iconSet: 'Feather',
    cardBg: 'dark',
    tag: 'TOP PICK',
    tagStyle: 'dark',
  },
  {
    id: '9',
    name: 'Babyzen YOYO²',
    shortDesc: 'Travel stroller · cabin-approved',
    description: 'The world\'s most compact stroller. Folds in 5 seconds, fits in overhead bin. Perfect for travelling families.',
    category: 'little-ones',
    pricePerDay: 70,
    price8to30: 53,
    price30plus: 40,
    deposit: 600,
    rating: 4.9,
    reviewCount: 37,
    rentalCount: 84,
    available: true,
    stockLeft: 2,
    specs: { weight: '6.2 kg', dimensions: '52 × 44 × 18 cm', condition: 'Excellent (9/10)' },
    iconName: 'user',
    iconSet: 'Feather',
    cardBg: 'beige',
    tag: 'NEW',
    tagStyle: 'amber',
  },
  {
    id: '10',
    name: 'Theragun Pro',
    shortDesc: 'Percussive therapy device',
    description: 'Professional-grade massage gun for muscle recovery. 6 attachments, quiet motor, 150-minute battery.',
    category: 'glow-relax',
    pricePerDay: 40,
    price8to30: 30,
    price30plus: 22,
    deposit: 400,
    rating: 4.8,
    reviewCount: 15,
    rentalCount: 42,
    available: true,
    stockLeft: 4,
    specs: { weight: '1.1 kg', condition: 'Excellent (9/10)' },
    iconName: 'zap',
    iconSet: 'Feather',
    cardBg: 'default',
    tag: 'NEW',
    tagStyle: 'amber',
  },
  {
    id: '11',
    name: 'Road Bike',
    shortDesc: 'Trek · lightweight alloy',
    description: 'Lightweight road bike ideal for commuting and weekend rides. 21-speed Shimano groupset, included helmet and lock.',
    category: 'move-train',
    pricePerDay: 25,
    price8to30: 19,
    price30plus: 14,
    deposit: 500,
    rating: 4.6,
    reviewCount: 28,
    rentalCount: 66,
    available: true,
    stockLeft: 2,
    specs: { weight: '8.5 kg', condition: 'Good (8/10)' },
    iconName: 'navigation',
    iconSet: 'Feather',
    cardBg: 'default',
  },
  {
    id: '12',
    name: 'Dyson V15',
    shortDesc: 'Cordless vacuum · HEPA filter',
    description: 'Powerful cordless vacuum with laser dust detection. Removes 99.97% of particles. 60-minute runtime.',
    category: 'clean-care',
    pricePerDay: 30,
    price8to30: 22,
    price30plus: 17,
    deposit: 300,
    rating: 4.8,
    reviewCount: 21,
    rentalCount: 73,
    available: true,
    stockLeft: 3,
    specs: { weight: '3.1 kg', condition: 'Excellent (9/10)' },
    iconName: 'wind',
    iconSet: 'Feather',
    cardBg: 'beige',
  },
];

export const MOCK_RESERVATIONS: Reservation[] = [
  {
    id: 'res1',
    userId: 'user1',
    productId: '6',
    productName: 'Scandinavian Armchair',
    productIcon: 'square',
    productIconSet: 'Feather',
    startDate: '2026-05-14',
    endDate: '2026-05-21',
    store: 'Setthathirath · Downtown',
    status: 'active',
    totalPrice: 570,
    depositAmount: 800,
    paidNow: 942,
    payAtPickup: 428,
    bookingId: 'LCH-2026-04812',
    cardBg: 'amber',
    daysCurrent: 2,
    daysTotal: 8,
  },
  {
    id: 'res2',
    userId: 'user1',
    productId: '5',
    productName: 'Nespresso Vertuo Plus',
    productIcon: 'coffee',
    productIconSet: 'Feather',
    startDate: '2026-04-28',
    endDate: '2026-05-26',
    store: 'Setthathirath · Downtown',
    status: 'active',
    totalPrice: 1820,
    depositAmount: 800,
    paidNow: 1255,
    payAtPickup: 1365,
    bookingId: 'LCH-2026-04793',
    cardBg: 'dark',
    daysCurrent: 16,
    daysTotal: 28,
  },
];
