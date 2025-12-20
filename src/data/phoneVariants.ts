// Seed data for phone case variants
// In production, this would be synced from Printful's catalog API

export interface PhoneVariant {
  id: string;
  printfulVariantId: number;
  brand: string;
  model: string;
  color: string;
  colorHex: string;
  price: number;
  currency: string;
  printAreaWidth: number;
  printAreaHeight: number;
  imageUrl: string;
  mockupUrl?: string;
}

export const phoneVariants: PhoneVariant[] = [
  // iPhone 15 Pro Max
  {
    id: "iphone-15-pro-max-black",
    printfulVariantId: 18001,
    brand: "Apple",
    model: "iPhone 15 Pro Max",
    color: "Black Titanium",
    colorHex: "#1d1d1f",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
  },
  {
    id: "iphone-15-pro-max-white",
    printfulVariantId: 18002,
    brand: "Apple",
    model: "iPhone 15 Pro Max",
    color: "White Titanium",
    colorHex: "#f5f5f7",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
  },
  {
    id: "iphone-15-pro-max-natural",
    printfulVariantId: 18003,
    brand: "Apple",
    model: "iPhone 15 Pro Max",
    color: "Natural Titanium",
    colorHex: "#a6a6a6",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1640,
    printAreaHeight: 3360,
    imageUrl: "/placeholder.svg",
  },
  // iPhone 15 Pro
  {
    id: "iphone-15-pro-black",
    printfulVariantId: 18011,
    brand: "Apple",
    model: "iPhone 15 Pro",
    color: "Black Titanium",
    colorHex: "#1d1d1f",
    price: 22.99,
    currency: "USD",
    printAreaWidth: 1560,
    printAreaHeight: 3200,
    imageUrl: "/placeholder.svg",
  },
  {
    id: "iphone-15-pro-white",
    printfulVariantId: 18012,
    brand: "Apple",
    model: "iPhone 15 Pro",
    color: "White Titanium",
    colorHex: "#f5f5f7",
    price: 22.99,
    currency: "USD",
    printAreaWidth: 1560,
    printAreaHeight: 3200,
    imageUrl: "/placeholder.svg",
  },
  // iPhone 15
  {
    id: "iphone-15-pink",
    printfulVariantId: 18021,
    brand: "Apple",
    model: "iPhone 15",
    color: "Pink",
    colorHex: "#f9cdd3",
    price: 19.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
  },
  {
    id: "iphone-15-blue",
    printfulVariantId: 18022,
    brand: "Apple",
    model: "iPhone 15",
    color: "Blue",
    colorHex: "#a7c1d9",
    price: 19.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
  },
  {
    id: "iphone-15-green",
    printfulVariantId: 18023,
    brand: "Apple",
    model: "iPhone 15",
    color: "Green",
    colorHex: "#d1d9ce",
    price: 19.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
  },
  // Samsung Galaxy S24 Ultra
  {
    id: "galaxy-s24-ultra-black",
    printfulVariantId: 19001,
    brand: "Samsung",
    model: "Galaxy S24 Ultra",
    color: "Titanium Black",
    colorHex: "#1a1a1a",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
  },
  {
    id: "galaxy-s24-ultra-gray",
    printfulVariantId: 19002,
    brand: "Samsung",
    model: "Galaxy S24 Ultra",
    color: "Titanium Gray",
    colorHex: "#8a8a8a",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
  },
  {
    id: "galaxy-s24-ultra-violet",
    printfulVariantId: 19003,
    brand: "Samsung",
    model: "Galaxy S24 Ultra",
    color: "Titanium Violet",
    colorHex: "#9d8baf",
    price: 24.99,
    currency: "USD",
    printAreaWidth: 1680,
    printAreaHeight: 3440,
    imageUrl: "/placeholder.svg",
  },
  // Samsung Galaxy S24
  {
    id: "galaxy-s24-cream",
    printfulVariantId: 19011,
    brand: "Samsung",
    model: "Galaxy S24",
    color: "Cream",
    colorHex: "#f5f0e8",
    price: 19.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
  },
  {
    id: "galaxy-s24-violet",
    printfulVariantId: 19012,
    brand: "Samsung",
    model: "Galaxy S24",
    color: "Violet",
    colorHex: "#bfafd4",
    price: 19.99,
    currency: "USD",
    printAreaWidth: 1520,
    printAreaHeight: 3120,
    imageUrl: "/placeholder.svg",
  },
];

// Group variants by model
export const getPhoneModels = () => {
  const models = new Map<string, PhoneVariant[]>();
  phoneVariants.forEach((variant) => {
    const key = `${variant.brand} ${variant.model}`;
    if (!models.has(key)) {
      models.set(key, []);
    }
    models.get(key)!.push(variant);
  });
  return models;
};

export const getVariantById = (id: string) => {
  return phoneVariants.find((v) => v.id === id);
};

export const getBrands = () => {
  return [...new Set(phoneVariants.map((v) => v.brand))];
};
