// Seed data for phone case variants
// In production, this would be synced from Printful's catalog API

export type CameraPosition = "top-left" | "top-right" | "top-center";
export type CameraShape = "square" | "pill" | "island" | "vertical-strip";

export interface LensConfig {
  x: number; // position as % of camera module width
  y: number; // position as % of camera module height
  size: number; // size as % of camera module width
  type: "lens" | "flash" | "sensor" | "mic";
}

export interface CameraConfig {
  position: CameraPosition;
  shape: CameraShape;
  // Size as percentage of print area
  widthPercent: number;
  heightPercent: number;
  // Offset from edge as percentage
  offsetPercent: number;
  // Individual camera elements
  lenses: LensConfig[];
}

export interface PhoneVariant {
  id: string;
  printfulVariantId: number;
  brand: string;
  model: string;
  price: number;
  currency: string;
  printAreaWidth: number;
  printAreaHeight: number;
  imageUrl: string;
  mockupUrl?: string;
  camera: CameraConfig;
}

// iPhone Pro camera (3 lenses + flash) - square module
const iphoneProCamera: CameraConfig = {
  position: "top-left",
  shape: "square",
  widthPercent: 32,
  heightPercent: 16,
  offsetPercent: 3,
  lenses: [
    { x: 22, y: 28, size: 32, type: "lens" },
    { x: 22, y: 72, size: 32, type: "lens" },
    { x: 60, y: 50, size: 32, type: "lens" },
    { x: 78, y: 22, size: 12, type: "flash" },
    { x: 78, y: 78, size: 8, type: "sensor" },
  ],
};

// iPhone standard camera (2 lenses diagonal) - pill/vertical
const iphoneStandardCamera: CameraConfig = {
  position: "top-left",
  shape: "pill",
  widthPercent: 18,
  heightPercent: 14,
  offsetPercent: 3,
  lenses: [
    { x: 50, y: 30, size: 45, type: "lens" },
    { x: 50, y: 70, size: 45, type: "lens" },
  ],
};

// Samsung Ultra camera - vertical strip with 4 lenses
const samsungUltraCamera: CameraConfig = {
  position: "top-left",
  shape: "vertical-strip",
  widthPercent: 14,
  heightPercent: 26,
  offsetPercent: 4,
  lenses: [
    { x: 50, y: 14, size: 38, type: "lens" },
    { x: 50, y: 38, size: 38, type: "lens" },
    { x: 50, y: 62, size: 38, type: "lens" },
    { x: 50, y: 86, size: 25, type: "lens" },
  ],
};

// Samsung standard camera - vertical strip with 3 lenses
const samsungStandardCamera: CameraConfig = {
  position: "top-left",
  shape: "vertical-strip",
  widthPercent: 12,
  heightPercent: 22,
  offsetPercent: 4,
  lenses: [
    { x: 50, y: 20, size: 42, type: "lens" },
    { x: 50, y: 50, size: 42, type: "lens" },
    { x: 50, y: 80, size: 32, type: "lens" },
  ],
};

export const phoneVariants: PhoneVariant[] = [
  // iPhone 17 Series (Snap Case - Product ID: 683)
  {
    id: "iphone-17-pro-max",
    printfulVariantId: 34015,
    brand: "Apple",
    model: "iPhone 17 Pro Max",
    price: 29.99,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-17-pro",
    printfulVariantId: 34013,
    brand: "Apple",
    model: "iPhone 17 Pro",
    price: 27.99,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-17-air",
    printfulVariantId: 34011,
    brand: "Apple",
    model: "iPhone 17 Air",
    price: 26.99,
    currency: "USD",
    printAreaWidth: 1600,
    printAreaHeight: 3280,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  {
    id: "iphone-17",
    printfulVariantId: 34009,
    brand: "Apple",
    model: "iPhone 17",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  // iPhone 16 Series (Snap Case - Product ID: 683)
  {
    id: "iphone-16-pro-max",
    printfulVariantId: 20297,
    brand: "Apple",
    model: "iPhone 16 Pro Max",
    price: 26.99,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-16-pro",
    printfulVariantId: 20296,
    brand: "Apple",
    model: "iPhone 16 Pro",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-16-plus",
    printfulVariantId: 20295,
    brand: "Apple",
    model: "iPhone 16 Plus",
    price: 22.99,
    currency: "USD",
    printAreaWidth: 1600,
    printAreaHeight: 3280,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  {
    id: "iphone-16",
    printfulVariantId: 20294,
    brand: "Apple",
    model: "iPhone 16",
    price: 19.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  // iPhone 15 Series (Snap Case - Product ID: 683)
  {
    id: "iphone-15-pro-max",
    printfulVariantId: 17728,
    brand: "Apple",
    model: "iPhone 15 Pro Max",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-15-pro",
    printfulVariantId: 17726,
    brand: "Apple",
    model: "iPhone 15 Pro",
    price: 22.99,
    currency: "USD",
    printAreaWidth: 1560,
    printAreaHeight: 3200,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-15-plus",
    printfulVariantId: 17724,
    brand: "Apple",
    model: "iPhone 15 Plus",
    price: 21.99,
    currency: "USD",
    printAreaWidth: 1560,
    printAreaHeight: 3200,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  {
    id: "iphone-15",
    printfulVariantId: 17722,
    brand: "Apple",
    model: "iPhone 15",
    price: 19.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  // iPhone 14 Series (Snap Case - Product ID: 683)
  {
    id: "iphone-14-pro-max",
    printfulVariantId: 16916,
    brand: "Apple",
    model: "iPhone 14 Pro Max",
    price: 22.99,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-14-pro",
    printfulVariantId: 16912,
    brand: "Apple",
    model: "iPhone 14 Pro",
    price: 21.99,
    currency: "USD",
    printAreaWidth: 1560,
    printAreaHeight: 3200,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-14",
    printfulVariantId: 16910,
    brand: "Apple",
    model: "iPhone 14",
    price: 18.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  // Samsung Galaxy S24 Series (Snap Case - Product ID: 684)
  {
    id: "galaxy-s24-ultra",
    printfulVariantId: 18739,
    brand: "Samsung",
    model: "Galaxy S24 Ultra",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
    camera: samsungUltraCamera,
  },
  {
    id: "galaxy-s24-plus",
    printfulVariantId: 18738,
    brand: "Samsung",
    model: "Galaxy S24+",
    price: 22.99,
    currency: "USD",
    printAreaWidth: 1600,
    printAreaHeight: 3280,
    imageUrl: "/placeholder.svg",
    camera: samsungStandardCamera,
  },
  {
    id: "galaxy-s24",
    printfulVariantId: 18737,
    brand: "Samsung",
    model: "Galaxy S24",
    price: 19.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
    camera: samsungStandardCamera,
  },
];

// Get unique phone models (now 1:1 with variants)
export const getPhoneModels = () => {
  const models = new Map<string, PhoneVariant[]>();
  phoneVariants.forEach((variant) => {
    const key = `${variant.brand} ${variant.model}`;
    models.set(key, [variant]);
  });
  return models;
};

export const getVariantById = (id: string) => {
  return phoneVariants.find((v) => v.id === id);
};

export const getBrands = () => {
  return [...new Set(phoneVariants.map((v) => v.brand))];
};
