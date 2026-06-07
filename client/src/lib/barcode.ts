const EAN_LEFT_ODD: Record<string, string> = {
  "0": "0001101",
  "1": "0011001",
  "2": "0010011",
  "3": "0111101",
  "4": "0100011",
  "5": "0110001",
  "6": "0101111",
  "7": "0111011",
  "8": "0110111",
  "9": "0001011"
};

const EAN_LEFT_EVEN: Record<string, string> = {
  "0": "0100111",
  "1": "0110011",
  "2": "0011011",
  "3": "0100001",
  "4": "0011101",
  "5": "0111001",
  "6": "0000101",
  "7": "0010001",
  "8": "0001001",
  "9": "0010111"
};

const EAN_RIGHT: Record<string, string> = {
  "0": "1110010",
  "1": "1100110",
  "2": "1101100",
  "3": "1000010",
  "4": "1011100",
  "5": "1001110",
  "6": "1010000",
  "7": "1000100",
  "8": "1001000",
  "9": "1110100"
};

const EAN_PARITY: Record<string, string> = {
  "0": "OOOOOO",
  "1": "OOEOEE",
  "2": "OOEEOE",
  "3": "OOEEEO",
  "4": "OEOOEE",
  "5": "OEEOOE",
  "6": "OEEEOO",
  "7": "OEOEOE",
  "8": "OEOEEO",
  "9": "OEEOEO"
};

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

function escapeSvg(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ean13CheckDigit(first12: string) {
  const sum = first12.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function bitsToSvg(bits: string, text: string, height = 84, showText = true) {
  const moduleWidth = 2;
  const quiet = 14;
  const width = bits.length * moduleWidth + quiet * 2;
  const textHeight = showText ? 20 : 0;
  const bars = bits
    .split("")
    .map((bit, index) => bit === "1" ? `<rect x="${quiet + index * moduleWidth}" y="0" width="${moduleWidth}" height="${height}" />` : "")
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + textHeight}" width="${width}" height="${height + textHeight}" role="img" aria-label="Barcode ${escapeSvg(text)}"><rect width="100%" height="100%" fill="#fff"/>${bars}${showText ? `<text x="${width / 2}" y="${height + 15}" text-anchor="middle" font-family="Courier New, monospace" font-size="16" font-weight="700" fill="#000">${escapeSvg(text)}</text>` : ""}</svg>`;
}

function makeEan13Bits(value: string) {
  const numeric = value.replace(/\D/g, "");
  const normalized = numeric.length === 12 ? `${numeric}${ean13CheckDigit(numeric)}` : numeric;
  if (!/^\d{13}$/.test(normalized)) return null;

  const parity = EAN_PARITY[normalized[0]];
  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    const digit = normalized[index];
    bits += parity[index - 1] === "O" ? EAN_LEFT_ODD[digit] : EAN_LEFT_EVEN[digit];
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) bits += EAN_RIGHT[normalized[index]];
  bits += "101";
  return { bits, text: normalized };
}

function makeCode128Bits(value: string) {
  const text = value.slice(0, 48) || "MM-SUPERMART";
  const codes = [104, ...text.split("").map((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code <= 126 ? code - 32 : 0;
  })];
  const checksum = codes.reduce((total, code, index) => total + code * (index === 0 ? 1 : index), 0) % 103;
  return [...codes, checksum, 106].map((code) => CODE128_PATTERNS[code]).join("");
}

export function generateBarcodeSvg(value: string, options: { showText?: boolean } = {}) {
  const ean = makeEan13Bits(value);
  if (ean) return bitsToSvg(ean.bits, ean.text, 82, options.showText ?? true);
  return bitsToSvg(makeCode128Bits(value), value, 82, options.showText ?? true);
}

export function barcodeSvgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
