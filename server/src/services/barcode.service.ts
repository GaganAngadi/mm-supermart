export const INVENTORY_BARCODE_TYPE = "CODE128";

export function normalizeInventoryBarcode(value = "") {
  return value.replace(/[^A-Za-z0-9_-]+/g, "").trim().slice(0, 50);
}

export function makeInventoryBarcode(sequence: number) {
  return `MMM${String(Math.max(1, sequence)).padStart(6, "0")}`;
}

export function resolveInventoryBarcode(input: { sku?: string | null; barcode?: string | null }, sequence: number) {
  const sku = normalizeInventoryBarcode(input.sku ?? "");
  if (sku) return sku;
  const barcode = normalizeInventoryBarcode(input.barcode ?? "");
  if (barcode) return barcode;
  return makeInventoryBarcode(sequence);
}
