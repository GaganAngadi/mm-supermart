"use client";

import { Barcode, CheckSquare, Copy, FileCode2, ImageDown, Play, Printer, RefreshCw, Search, Settings, Square, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ThermalBarcodeLabel, thermalBarcodeLabelCss } from "@/components/labels/thermal-barcode-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { barcodeSvgToDataUrl, generateBarcodeSvg } from "@/lib/barcode";
import { listDesktopPrinters, printQrLabelsDirect, type DesktopPrinter } from "@/lib/electron-pos";
import { useProductStore, type ProductRecord } from "@/lib/stores/product-store";
import { formatCurrency } from "@/lib/utils";

type ValueMode = "barcode" | "sku";
type OutputMode = "png" | "svg";
type QueueStatus = "ready" | "printing" | "printed" | "failed";
type QueueItem = {
  id: string;
  labelType: "barcode";
  name: string;
  sku: string;
  barcode: string;
  price: number;
  barcodeSvg?: string;
  valueMode: ValueMode;
  status: QueueStatus;
};

const TEST_PRODUCT: ProductRecord = {
  name: "Amul Milk 500ml",
  sku: "AMUL-MILK-500ML",
  barcode: "8901030993404",
  category: "Dairy",
  unit: "pcs",
  batch: "TEST",
  expiry: "Not tracked",
  manufactureDate: "Not tracked",
  expiryDate: "Not tracked",
  purchasedBy: "Direct Purchase",
  gstMode: "included",
  stock: 1,
  gst: 0,
  mrp: 32,
  sellingPrice: 32,
  purchasePrice: 27
};

function getQrValue(product: ProductRecord, valueMode: ValueMode) {
  return valueMode === "barcode" ? product.barcode : product.sku;
}

function getPrice(product: ProductRecord) {
  return Number(product.sellingPrice || product.mrp || 0);
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function downloadTextFile(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(filename, url);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "label";
}

export function BarcodeLabelPrintingModule() {
  const { products } = useProductStore();
  const productList = useMemo(() => {
    const hasTestCase = products.some((product) => product.barcode === TEST_PRODUCT.barcode || product.sku === TEST_PRODUCT.sku);
    return hasTestCase ? products : [TEST_PRODUCT, ...products];
  }, [products]);
  const [query, setQuery] = useState("");
  const [selectedSkus, setSelectedSkus] = useState<string[]>([productList[0]?.sku].filter(Boolean));
  const [previewSku, setPreviewSku] = useState(productList[0]?.sku ?? "");
  const [valueMode, setValueMode] = useState<ValueMode>("barcode");
  const [outputMode, setOutputMode] = useState<OutputMode>("png");
  const [copies, setCopies] = useState("1");
  const [printers, setPrinters] = useState<DesktopPrinter[]>([]);
  const [printerName, setPrinterName] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [barcodeSvg, setBarcodeSvg] = useState("");
  const [barcodePng, setBarcodePng] = useState("");
  const [message, setMessage] = useState("Ready for 50mm x 25mm direct thermal barcode label printing.");
  const [printing, setPrinting] = useState(false);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = normalized
      ? productList.filter((product) => [product.name, product.sku, product.barcode, product.category].some((value) => String(value ?? "").toLowerCase().includes(normalized)))
      : productList;
    return source.slice(0, 80);
  }, [productList, query]);

  const previewProduct = useMemo(() => productList.find((product) => product.sku === previewSku) ?? filteredProducts[0] ?? productList[0], [filteredProducts, previewSku, productList]);
  const selectedProducts = useMemo(() => productList.filter((product) => selectedSkus.includes(product.sku)), [productList, selectedSkus]);
  const selectedValue = previewProduct ? getQrValue(previewProduct, valueMode) : "";
  const copyCount = Math.max(1, Math.min(100, Number(copies) || 1));
  const preferredPrinter = printers.find((printer) => printer.name === printerName) ?? printers[0];

  useEffect(() => {
    if (!selectedSkus.length && productList[0]) {
      setSelectedSkus([productList[0].sku]);
      setPreviewSku(productList[0].sku);
    }
  }, [productList, selectedSkus.length]);

  useEffect(() => {
    let active = true;
    async function loadPrinters() {
      const installedPrinters = await listDesktopPrinters();
      if (!active) return;
      setPrinters(installedPrinters);
      const tvs = installedPrinters.find((printer) => printer.name.toLowerCase().includes("tvs lp46 dlite") || String(printer.displayName || "").toLowerCase().includes("tvs lp46 dlite"));
      const defaultPrinter = tvs ?? installedPrinters.find((printer) => printer.isDefault) ?? installedPrinters[0];
      setPrinterName((current) => current || defaultPrinter?.name || "");
    }
    void loadPrinters();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!previewProduct || !selectedValue) {
      setBarcodeSvg("");
      setBarcodePng("");
      return;
    }

    let active = true;
    async function generatePreviewCodes() {
      try {
        const nextBarcodeSvg = generateBarcodeSvg(selectedValue);
        if (!active) return;
        setBarcodeSvg(nextBarcodeSvg);
        setBarcodePng(barcodeSvgToDataUrl(nextBarcodeSvg));
        setMessage(`Preview ready for ${previewProduct.name}. Barcode source: ${valueMode === "barcode" ? "barcode" : "SKU"}.`);
      } catch (error) {
        if (!active) return;
        setBarcodeSvg("");
        setBarcodePng("");
        setMessage(error instanceof Error ? error.message : "Could not generate label code.");
      }
    }

    void generatePreviewCodes();
    return () => {
      active = false;
    };
  }, [previewProduct, selectedValue, valueMode]);

  function toggleProduct(product: ProductRecord) {
    setPreviewSku(product.sku);
    setSelectedSkus((current) => (current.includes(product.sku) ? current.filter((sku) => sku !== product.sku) : [...current, product.sku]));
  }

  function selectVisibleProducts() {
    const visibleSkus = filteredProducts.map((product) => product.sku);
    const allVisibleSelected = visibleSkus.every((sku) => selectedSkus.includes(sku));
    setSelectedSkus(allVisibleSelected ? selectedSkus.filter((sku) => !visibleSkus.includes(sku)) : Array.from(new Set([...selectedSkus, ...visibleSkus])));
  }

  async function buildQueueItems() {
    const items: QueueItem[] = [];
    for (const product of selectedProducts) {
      const codeValue = getQrValue(product, valueMode);
      if (!codeValue) continue;
      const productBarcodeSvg = generateBarcodeSvg(codeValue);
      for (let copy = 1; copy <= copyCount; copy += 1) {
        items.push({
          id: `${product.sku}-${copy}-${Date.now()}`,
          labelType: "barcode",
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: getPrice(product),
          barcodeSvg: productBarcodeSvg,
          valueMode,
          status: "ready"
        });
      }
    }
    return items;
  }

  async function prepareQueue() {
    if (!selectedProducts.length) {
      setMessage("Select at least one product before preparing the queue.");
      return;
    }
    const items = await buildQueueItems();
    setQueue(items);
    setMessage(`${items.length} barcode label${items.length === 1 ? "" : "s"} queued. Each queue row prints as one 50mm x 25mm label.`);
  }

  async function printQueue() {
    const items = queue.length ? queue : await buildQueueItems();
    if (!items.length) {
      setMessage("No valid labels to print.");
      return;
    }
    setQueue(items);
    setPrinting(true);
    setMessage("Sending labels to the Windows printer queue...");
    try {
      setQueue(items.map((item) => ({ ...item, status: "printing" })));
      const result = await printQrLabelsDirect({ printerName, items });
      if (!result.ok) throw new Error(String(result.message || "Label print failed."));
      setQueue(items.map((item) => ({ ...item, status: "printed" })));
      setMessage(`Printed ${result.printed ?? items.length} label(s) on ${String(result.printerName || preferredPrinter?.name || "selected printer")}.`);
    } catch (error) {
      setQueue(items.map((item) => ({ ...item, status: "failed" })));
      setMessage(error instanceof Error ? error.message : "Label print failed.");
    } finally {
      setPrinting(false);
    }
  }

  function loadTestCase() {
    setQuery("Amul Milk 500ml");
    setSelectedSkus([TEST_PRODUCT.sku]);
    setPreviewSku(TEST_PRODUCT.sku);
    setCopies("1");
    setValueMode("barcode");
    setQueue([]);
    setMessage("Test case loaded for barcode printing: Amul Milk 500ml, barcode 8901030993404, price 32.");
  }

  function downloadCode() {
    if (!previewProduct || !barcodeSvg || !barcodePng) return;
    const base = `${safeFilename(previewProduct.sku)}-barcode-${valueMode}`;
    if (outputMode === "svg") {
      downloadTextFile(`${base}.svg`, barcodeSvg, "image/svg+xml;charset=utf-8");
      return;
    }
    downloadDataUrl(`${base}.png`, barcodePng);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Barcode Label Printing</h1>
          <p className="text-muted-foreground">TVS LP46 DLite direct thermal labels, calibrated to 50mm x 25mm with 2mm gap detection.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!previewProduct || !barcodeSvg} onClick={downloadCode}>
            {outputMode === "svg" ? <FileCode2 className="size-4" /> : <ImageDown className="size-4" />}
            Download {outputMode.toUpperCase()}
          </Button>
          <Button variant="outline" onClick={prepareQueue} disabled={!selectedProducts.length || printing}><Tags className="size-4" /> Queue</Button>
          <Button onClick={printQueue} disabled={!selectedProducts.length || printing}><Printer className="size-4" /> Print</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Bulk Product Selection</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Select products, set copies, preview the exact label, then print silently through Electron.</p>
            </div>
            <Input className="md:max-w-sm" icon={Search} placeholder="Search name, SKU, barcode" value={query} onChange={(event) => setQuery(event.target.value)} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Code Source</p>
                <div className="mt-3 grid grid-cols-2 rounded-md border bg-background p-1">
                  <button className={`h-9 rounded text-sm font-medium ${valueMode === "barcode" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setValueMode("barcode")}>Barcode</button>
                  <button className={`h-9 rounded text-sm font-medium ${valueMode === "sku" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setValueMode("sku")}>SKU</button>
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Output</p>
                <div className="mt-3 grid grid-cols-2 rounded-md border bg-background p-1">
                  <button className={`h-9 rounded text-sm font-medium ${outputMode === "png" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setOutputMode("png")}>PNG</button>
                  <button className={`h-9 rounded text-sm font-medium ${outputMode === "svg" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setOutputMode("svg")}>SVG</button>
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Copies</p>
                <Input className="mt-3" min="1" max="100" type="number" value={copies} onChange={(event) => setCopies(event.target.value)} />
              </div>
              <div className="rounded-md border bg-muted/20 p-3 md:col-span-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Windows Printer</p>
                <div className="mt-3 flex gap-2">
                  <select className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={printerName} onChange={(event) => setPrinterName(event.target.value)}>
                    {printers.map((printer) => <option value={printer.name} key={printer.name}>{printer.displayName || printer.name}{printer.isDefault ? " (Default)" : ""}</option>)}
                    {!printers.length ? <option value="">Desktop printer API unavailable</option> : null}
                  </select>
                  <Button variant="outline" size="icon" title="Refresh printers" onClick={async () => setPrinters(await listDesktopPrinters())}><RefreshCw className="size-4" /></Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm">
              <div>
                <span className="font-semibold">{selectedProducts.length}</span> selected x <span className="font-semibold">{copyCount}</span> copies = <span className="font-semibold">{selectedProducts.length * copyCount}</span> possible labels
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectVisibleProducts}><CheckSquare className="size-4" /> Select Visible</Button>
                <Button variant="outline" size="sm" onClick={loadTestCase}><Barcode className="size-4" /> Test Case</Button>
              </div>
            </div>

            <div className="max-h-[470px] overflow-auto rounded-md border">
              <table className="w-full min-w-[940px] border-collapse text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="border px-3 py-2">Pick</th>
                    <th className="border px-3 py-2">Product</th>
                    <th className="border px-3 py-2">SKU</th>
                    <th className="border px-3 py-2">Barcode</th>
                    <th className="border px-3 py-2 text-right">Price</th>
                    <th className="border px-3 py-2 text-center">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const selected = selectedSkus.includes(product.sku);
                    return (
                      <tr className={product.sku === previewProduct?.sku ? "bg-primary/10" : "odd:bg-background even:bg-muted/20"} key={product.sku}>
                        <td className="border px-3 py-2">
                          <button className="flex items-center gap-2 font-medium" onClick={() => toggleProduct(product)}>{selected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4 text-muted-foreground" />} {selected ? "Selected" : "Select"}</button>
                        </td>
                        <td className="border px-3 py-2 font-medium">{product.name}</td>
                        <td className="border px-3 py-2">{product.sku}</td>
                        <td className="border px-3 py-2">{product.barcode}</td>
                        <td className="border px-3 py-2 text-right">{formatCurrency(getPrice(product))}</td>
                        <td className="border px-3 py-2 text-center"><Button size="sm" variant="outline" onClick={() => setPreviewSku(product.sku)}><Barcode className="size-4" /> Preview</Button></td>
                      </tr>
                    );
                  })}
                  {!filteredProducts.length ? <tr><td className="border px-3 py-8 text-center text-muted-foreground" colSpan={6}>No products found.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">{message}</p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Print Preview</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">One label, 50mm x 25mm, no page scaling, 1D barcode.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-white p-4">
                {previewProduct && barcodeSvg ? (
                  <>
                    <style>{thermalBarcodeLabelCss}</style>
                    <ThermalBarcodeLabel productName={previewProduct.name} barcode={selectedValue} barcodeSvg={barcodeSvg} price={getPrice(previewProduct)} />
                  </>
                ) : (
                  <div className="flex h-[25mm] w-[50mm] items-center justify-center border border-dashed text-xs text-muted-foreground">No label</div>
                )}
              </div>
              {barcodePng ? <img src={barcodePng} alt="Generated barcode SVG preview" className="mx-auto h-28 w-full max-w-xs rounded-md border bg-white p-3 object-contain" /> : null}
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold"><Barcode className="size-4 text-primary" /> Barcode payload</div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{selectedValue || "Select a product"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Queue & Calibration</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Print DPI 203, margin 0, padding 0, direct thermal, gap detection enabled.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border p-2"><span className="block text-muted-foreground">Printer</span><span className="font-semibold">{preferredPrinter?.displayName || preferredPrinter?.name || "Electron desktop required"}</span></div>
                <div className="rounded-md border p-2"><span className="block text-muted-foreground">Label</span><span className="font-semibold">50 x 25 mm</span></div>
                <div className="rounded-md border p-2"><span className="block text-muted-foreground">Gap</span><span className="font-semibold">2 mm</span></div>
                <div className="rounded-md border p-2"><span className="block text-muted-foreground">Copies</span><span className="font-semibold">{copyCount}</span></div>
              </div>
              <div className="max-h-56 overflow-auto rounded-md border">
                {queue.length ? queue.map((item, index) => (
                  <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0" key={item.id}>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{index + 1}. {item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.labelType.toUpperCase()} - {item.valueMode === "barcode" ? item.barcode : item.sku}</p>
                    </div>
                    <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs font-semibold">{item.status}</span>
                  </div>
                )) : <p className="p-4 text-sm text-muted-foreground">Queue is empty. Use Queue to preview the print run before sending labels.</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={prepareQueue} disabled={!selectedProducts.length || printing}><Copy className="size-4" /> Build Queue</Button>
                <Button onClick={printQueue} disabled={!selectedProducts.length || printing}><Play className="size-4" /> Print Queue</Button>
              </div>
              <Button variant="outline" className="w-full" onClick={() => window.mmPos?.printerAPI?.openSettings?.()}><Settings className="size-4" /> Windows Printer Settings</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
