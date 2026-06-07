export function buildInventoryQrPayload(input) {
    return JSON.stringify({
        productId: input.productId,
        productName: input.productName,
        sku: input.sku
    });
}
