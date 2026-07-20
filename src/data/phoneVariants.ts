// Seed data for phone case variants
// In production, this would be synced from Printful's catalog API
import { SNAPCASE_DEFAULT_PRODUCT_PRICE } from "../../supabase/functions/_shared/catalog-pricing.ts";

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
  printfulFinish: "Glossy" | "Matte";
  brand: string;
  model: string;
  edmSizeName?: string;
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
// On a real iPhone Pro, the camera module is about 35-40% of the case width
// For the canvas, we need to account for print area being larger than visible case
// Using larger percentages to make camera module prominently visible
const iphoneProCamera: CameraConfig = {
  position: "top-left",
  shape: "square",
  widthPercent: 38, // Make camera module significantly larger
  heightPercent: 19, // Keep visually square (38% * 1680/3440 ≈ 19%)
  offsetPercent: 6, // Push further from edge to avoid safe area overlap
  lenses: [
    // Triangle arrangement for 3 main lenses
    { x: 25, y: 25, size: 30, type: "lens" }, // Top-left lens
    { x: 25, y: 75, size: 30, type: "lens" }, // Bottom-left lens
    { x: 65, y: 50, size: 30, type: "lens" }, // Right center lens
    // Flash and sensors
    { x: 85, y: 25, size: 10, type: "flash" },
    { x: 85, y: 50, size: 7, type: "sensor" },
    { x: 85, y: 75, size: 5, type: "mic" },
  ],
};

// iPhone standard camera (2 lenses vertical pill)
// Smaller pill-shaped module
const iphoneStandardCamera: CameraConfig = {
  position: "top-left",
  shape: "pill",
  widthPercent: 22,
  heightPercent: 18,
  offsetPercent: 6,
  lenses: [
    { x: 50, y: 30, size: 50, type: "lens" },
    { x: 50, y: 70, size: 50, type: "lens" },
  ],
};

// Samsung Ultra camera - scattered individual lenses (no housing background)
// Lenses need to be well inside the safe area (which is ~5-6% from edge)
// Position them at ~15% from left edge with larger sizes
const samsungUltraCamera: CameraConfig = {
  position: "top-left",
  shape: "scattered",
  widthPercent: 25,
  heightPercent: 35,
  offsetPercent: 8,
  lenses: [
    // Vertical arrangement of 4 lenses - much larger and positioned inside safe area
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 14, absoluteY: 6, absoluteSize: 9 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 14, absoluteY: 14, absoluteSize: 9 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 14, absoluteY: 21, absoluteSize: 7 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 14, absoluteY: 27, absoluteSize: 5.5 },
    { x: 0, y: 0, size: 0, type: "flash", absoluteX: 24, absoluteY: 8, absoluteSize: 3 },
    { x: 0, y: 0, size: 0, type: "sensor", absoluteX: 24, absoluteY: 14, absoluteSize: 2 },
  ],
};

// Samsung standard camera - scattered individual lenses (3 lens setup)
const samsungStandardCamera: CameraConfig = {
  position: "top-left",
  shape: "scattered",
  widthPercent: 22,
  heightPercent: 28,
  offsetPercent: 8,
  lenses: [
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 14, absoluteY: 6, absoluteSize: 8 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 14, absoluteY: 13.5, absoluteSize: 8 },
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 14, absoluteY: 20.5, absoluteSize: 6.5 },
    { x: 0, y: 0, size: 0, type: "flash", absoluteX: 23, absoluteY: 8, absoluteSize: 2.5 },
  ],
};

export const phoneVariants: PhoneVariant[] = [
  // iPhone 17 Series (Snap Case - Product ID: 683)
  {
    id: "iphone-17-pro-max",
    printfulVariantId: 34015,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 17 Pro Max",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-17-pro",
    printfulVariantId: 34013,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 17 Pro",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-17-air",
    printfulVariantId: 34011,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 17 Air",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1600,
    printAreaHeight: 3280,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  {
    id: "iphone-17",
    printfulVariantId: 34009,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 17",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
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
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 16 Pro Max",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-16-pro",
    printfulVariantId: 20296,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 16 Pro",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-16-plus",
    printfulVariantId: 20295,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 16 Plus",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1600,
    printAreaHeight: 3280,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  {
    id: "iphone-16",
    printfulVariantId: 20294,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 16",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
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
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 15 Pro Max",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-15-pro",
    printfulVariantId: 17726,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 15 Pro",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1560,
    printAreaHeight: 3200,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-15-plus",
    printfulVariantId: 17724,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 15 Plus",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1560,
    printAreaHeight: 3200,
    imageUrl: "/placeholder.svg",
    camera: iphoneStandardCamera,
  },
  {
    id: "iphone-15",
    printfulVariantId: 17722,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 15",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
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
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 14 Pro Max",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-14-pro",
    printfulVariantId: 16912,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 14 Pro",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1560,
    printAreaHeight: 3200,
    imageUrl: "/placeholder.svg",
    camera: iphoneProCamera,
  },
  {
    id: "iphone-14",
    printfulVariantId: 16910,
    printfulFinish: "Glossy",
    brand: "Apple",
    model: "iPhone 14",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
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
    printfulFinish: "Glossy",
    brand: "Samsung",
    model: "Galaxy S24 Ultra",
    edmSizeName: "Samsung Galaxy S24 Ultra",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
    camera: samsungUltraCamera,
  },
  {
    id: "galaxy-s24-plus",
    printfulVariantId: 18738,
    printfulFinish: "Glossy",
    brand: "Samsung",
    model: "Galaxy S24+",
    edmSizeName: "Samsung Galaxy S24 Plus",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    currency: "USD",
    printAreaWidth: 1600,
    printAreaHeight: 3280,
    imageUrl: "/placeholder.svg",
    camera: samsungStandardCamera,
  },
  {
    id: "galaxy-s24",
    printfulVariantId: 18737,
    printfulFinish: "Glossy",
    brand: "Samsung",
    model: "Galaxy S24",
    edmSizeName: "Samsung Galaxy S24",
    price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
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

export const formatProductPrice = (
  variant: Pick<PhoneVariant, "price" | "currency">,
) =>
  `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: variant.currency,
  }).format(variant.price)} ${variant.currency}`;

export const getRelatedVariants = (variant: PhoneVariant, limit = 3) => {
  const brandVariants = phoneVariants.filter(
    (candidate) => candidate.brand === variant.brand,
  );
  const currentIndex = brandVariants.findIndex(
    (candidate) => candidate.id === variant.id,
  );

  if (currentIndex < 0) return [];

  return Array.from(
    { length: Math.min(limit, Math.max(brandVariants.length - 1, 0)) },
    (_, offset) =>
      brandVariants[(currentIndex + offset + 1) % brandVariants.length],
  );
};

export const getBrands = () => {
  return [...new Set(phoneVariants.map((v) => v.brand))];
};
