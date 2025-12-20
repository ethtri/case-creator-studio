// Seed data for phone case variants
// In production, this would be synced from Printful's catalog API

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
}

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
