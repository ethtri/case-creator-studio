// Seed data for phone case variants
// In production, this would be synced from Printful's catalog API

export type CameraPosition = "top-left" | "top-right" | "top-center";
export type CameraShape = "square" | "pill" | "island" | "vertical-strip" | "scattered";

export interface LensConfig {
  x: number; // position as % of camera module width (or print area for scattered)
  y: number; // position as % of camera module height (or print area for scattered)
  size: number; // size as % of camera module width
  type: "lens" | "flash" | "sensor" | "mic";
  // For scattered layout, absolute positioning relative to print area
  absoluteX?: number; // position as % of print area width
  absoluteY?: number; // position as % of print area height
  absoluteSize?: number; // size as % of print area width
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

export interface MockupConfig {
  // Design overlay area positioning (percentage of mockup dimensions)
  designArea: {
    top: number;
    left: number;
    width: number;
    height: number;
    borderRadius: number;
  };
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
  mockup?: MockupConfig;
}

// iPhone Pro camera (3 lenses in triangle + flash + sensor)
// Real iPhone Pro: camera module ~38mm on ~78mm case width = ~49% of case width
// But print area is larger than visible case. Printful template shows ~28-30% of print width
// Height: module is square, so height% = width% * (printWidth/printHeight) for visual square
const iphoneProCamera: CameraConfig = {
  position: "top-left",
  shape: "square",
  widthPercent: 30, // ~30% of print area width
  heightPercent: 15, // Creates visually square module (30% * 1680/3440 ≈ 15%)
  offsetPercent: 4, // Offset from edge to stay inside safe area
  lenses: [
    // Triangle arrangement for 3 main lenses
    { x: 22, y: 22, size: 32, type: "lens" }, // Top-left lens
    { x: 22, y: 78, size: 32, type: "lens" }, // Bottom-left lens
    { x: 62, y: 50, size: 32, type: "lens" }, // Right center lens
    // Flash and sensors
    { x: 88, y: 22, size: 12, type: "flash" },
    { x: 88, y: 50, size: 8, type: "sensor" },
    { x: 88, y: 78, size: 6, type: "mic" },
  ],
};

// iPhone standard camera (2 lenses vertical pill)
// Smaller pill-shaped module
const iphoneStandardCamera: CameraConfig = {
  position: "top-left",
  shape: "pill",
  widthPercent: 16,
  heightPercent: 14,
  offsetPercent: 4,
  lenses: [
    { x: 50, y: 28, size: 55, type: "lens" },
    { x: 50, y: 72, size: 55, type: "lens" },
  ],
};

// Samsung Ultra camera - scattered individual lenses (no housing background)
const samsungUltraCamera: CameraConfig = {
  position: "top-left",
  shape: "scattered",
  widthPercent: 18,
  heightPercent: 22,
  offsetPercent: 3,
  lenses: [
    // Vertical arrangement of 4 lenses
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 6, absoluteY: 3.5, absoluteSize: 4.5 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 6, absoluteY: 7.5, absoluteSize: 4.5 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 6, absoluteY: 11.5, absoluteSize: 3.5 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 6, absoluteY: 14.5, absoluteSize: 2.8 },
    { x: 0, y: 0, size: 0, type: "flash", absoluteX: 12, absoluteY: 4.5, absoluteSize: 1.5 },
    { x: 0, y: 0, size: 0, type: "sensor", absoluteX: 12, absoluteY: 7, absoluteSize: 1 },
  ],
};

// Samsung standard camera - scattered individual lenses (3 lens setup)
const samsungStandardCamera: CameraConfig = {
  position: "top-left",
  shape: "scattered",
  widthPercent: 14,
  heightPercent: 16,
  offsetPercent: 3,
  lenses: [
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 5.5, absoluteY: 3.5, absoluteSize: 4 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 5.5, absoluteY: 7.5, absoluteSize: 4 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 5.5, absoluteY: 11.5, absoluteSize: 3 },
    { x: 0, y: 0, size: 0, type: "flash", absoluteX: 11, absoluteY: 4.5, absoluteSize: 1.2 },
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
