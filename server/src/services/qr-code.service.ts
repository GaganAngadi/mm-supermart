export type InventoryQrPayload = {
  productId: string;
  productName: string;
  sku: string;
};

export function buildInventoryQrPayload(input: InventoryQrPayload) {
  return JSON.stringify({
    productId: input.productId,
    productName: input.productName,
    sku: input.sku
  });
}
