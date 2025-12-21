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

// iPhone Pro camera (3 lenses in triangle + flash + sensor) - square module with realistic proportions
const iphoneProCamera: CameraConfig = {
  position: "top-left",
  shape: "square",
  widthPercent: 28, // Slightly smaller, more realistic
  heightPercent: 14, // More square aspect ratio
  offsetPercent: 3,
  lenses: [
    // Triangle arrangement for 3 main lenses
    { x: 25, y: 30, size: 30, type: "lens" }, // Top-left lens
    { x: 25, y: 70, size: 30, type: "lens" }, // Bottom-left lens
    { x: 58, y: 50, size: 30, type: "lens" }, // Right center lens
    // Flash and sensors on right side
    { x: 80, y: 25, size: 10, type: "flash" },
    { x: 80, y: 50, size: 6, type: "sensor" }, // LiDAR
    { x: 80, y: 75, size: 4, type: "mic" },
  ],
};

// iPhone standard camera (2 lenses diagonal) - pill/vertical with refined proportions
const iphoneStandardCamera: CameraConfig = {
  position: "top-left",
  shape: "pill",
  widthPercent: 16, // Narrower
  heightPercent: 13, // Taller
  offsetPercent: 3,
  lenses: [
    { x: 50, y: 28, size: 50, type: "lens" },
    { x: 50, y: 72, size: 50, type: "lens" },
  ],
};

// Samsung Ultra camera - scattered individual lenses (no housing background)
const samsungUltraCamera: CameraConfig = {
  position: "top-left",
  shape: "scattered",
  widthPercent: 18, // Bounding area for scattered lenses
  heightPercent: 24,
  offsetPercent: 3,
  lenses: [
    // Each lens positioned absolutely as % of print area
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 4.5, absoluteY: 2, absoluteSize: 4.2 }, // Top large lens
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 4.5, absoluteY: 6, absoluteSize: 4.2 }, // Second lens
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 4.5, absoluteY: 10, absoluteSize: 3.2 }, // Third lens (periscope)
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 4.5, absoluteY: 13, absoluteSize: 2.4 }, // Fourth lens (smaller)
    { x: 0, y: 0, size: 0, type: "flash", absoluteX: 9, absoluteY: 3, absoluteSize: 1.2 }, // Flash
    { x: 0, y: 0, size: 0, type: "sensor", absoluteX: 9, absoluteY: 5, absoluteSize: 0.8 }, // Sensor
  ],
};

// Samsung standard camera - scattered individual lenses
const samsungStandardCamera: CameraConfig = {
  position: "top-left",
  shape: "scattered",
  widthPercent: 14,
  heightPercent: 20,
  offsetPercent: 3.5,
  lenses: [
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 4, absoluteY: 2.5, absoluteSize: 4 }, // Top lens
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 4, absoluteY: 6.5, absoluteSize: 4 }, // Middle lens
    { x: 0, y: 0, size: 0, type: "lens", absoluteX: 4, absoluteY: 10.5, absoluteSize: 3 }, // Bottom lens
    { x: 0, y: 0, size: 0, type: "flash", absoluteX: 8, absoluteY: 3.5, absoluteSize: 1 }, // Flash
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
