"use client";

type ThermalBarcodeLabelProps = {
  productName?: string;
  barcode: string;
  barcodeSvg: string;
  price?: number;
};

function formatPrice(price = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(price);
}

export function ThermalBarcodeLabel({ productName, barcode, barcodeSvg, price }: ThermalBarcodeLabelProps) {
  return (
    <section className="thermal-barcode-label">
      <div className="thermal-label-inner">
        {productName ? <div className="thermal-product-name">{productName}</div> : null}
        <div className="thermal-barcode-block">
          <div className="thermal-barcode-slot">
            <div className="thermal-barcode" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
          </div>
          <div className="thermal-barcode-number">{barcode}</div>
        </div>
        {price !== undefined ? <div className="thermal-price">Price: {formatPrice(price)}</div> : null}
      </div>
    </section>
  );
}

export const thermalBarcodeLabelCss = `
  @page { size: 50mm 25mm; margin: 0; }
  html, body {
    width: 50mm;
    margin: 0;
    padding: 0;
    background: #fff;
    overflow: hidden;
  }
  .thermal-barcode-label {
    width: 50mm;
    height: 25mm;
    margin: 0;
    padding: 0;
    position: relative;
    overflow: hidden;
    color: #000;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .thermal-label-inner {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: 4.8mm 15.6mm 3.6mm;
    justify-items: center;
    align-items: center;
    padding: 0.7mm 1.2mm 0.6mm;
    overflow: hidden;
    box-sizing: border-box;
  }
  .thermal-product-name {
    width: 47.6mm;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    text-align: center;
    font-size: 6.4pt;
    font-weight: 800;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .thermal-barcode-block {
    width: 47.6mm;
    height: 15.6mm;
    display: flex;
    flex-direction: column;
    gap: 0.25mm;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .thermal-barcode-slot {
    width: 47.6mm;
    height: 12.8mm;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thermal-barcode {
    width: 47.6mm;
    height: 12.8mm;
    margin: 0;
    overflow: hidden;
  }
  .thermal-barcode svg {
    width: 47.6mm;
    height: 12.8mm;
    display: block;
    fill: #000;
    shape-rendering: crispEdges;
  }
  .thermal-barcode-number {
    width: 47.6mm;
    height: 2.4mm;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    text-align: center;
    text-overflow: ellipsis;
    font-family: "Courier New", monospace;
    font-size: 6.2pt;
    font-weight: 900;
    line-height: 1;
  }
  .thermal-price {
    width: 47.6mm;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: right;
    font-size: 7.4pt;
    font-weight: 900;
    line-height: 1;
  }
`;
