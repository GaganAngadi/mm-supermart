import { create } from "zustand";

type Product = {
  name: string;
  sku: string;
  barcode?: string;
  unit?: string;
  mrp: number;
  sellingPrice: number;
  purchasePrice: number;
  gstRate?: number;
  gstMode?: "included" | "excluded";
  hsnCode?: string;
  stock?: number;
  imageUrl?: string;
  emoji?: string;
};
type CartItem = Product & { qty: number };

type CartStore = {
  items: CartItem[];
  add: (product: Product) => void;
  setQuantity: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  add: (product) => set((state) => {
    const existing = state.items.find((item) => item.sku === product.sku);
    if (existing) {
      return { items: state.items.map((item) => item.sku === product.sku ? { ...item, qty: item.qty > 0 ? item.qty + 1 : 1 } : item) };
    }
    return { items: [...state.items, { ...product, qty: 1 }] };
  }),
  setQuantity: (sku, qty) => set((state) => ({
    items: state.items.map((item) => item.sku === sku ? { ...item, qty: Math.max(0, Number(qty) || 0) } : item)
  })),
  remove: (sku) => set((state) => ({ items: state.items.filter((item) => item.sku !== sku) })),
  clear: () => set({ items: [] })
}));
