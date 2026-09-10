export function parseRupeesToPaise(input: string | number): bigint | null {
  if (input === "" || input === null || input === undefined) return null;

  const str = String(input).trim().replace(/,/g, "");
  if (str === "") return null;

  if (!isFinite(Number(str))) {
    throw new RangeError(`Cannot convert "${input}" to paise: not a finite number`);
  }

  // Parse entirely in string/bigint to avoid IEEE 754 float rounding errors.
  // "1,660,301.37" → str = "1660301.37" (commas already stripped above)
  const negative = str.startsWith("-");
  const abs = negative ? str.slice(1) : str;
  const dotPos = abs.indexOf(".");
  let intStr: string;
  let fracStr: string;

  if (dotPos === -1) {
    intStr = abs;
    fracStr = "00";
  } else {
    intStr = abs.slice(0, dotPos);
    fracStr = abs.slice(dotPos + 1).padEnd(2, "0").slice(0, 3); // up to 3 dp
  }

  // Paise from integer part
  const intPaise = BigInt(intStr || "0") * 100n;

  // Paise from fractional part — exactly 2dp plus optional 3rd for rounding
  const frac2 = BigInt(fracStr.slice(0, 2).padEnd(2, "0"));
  const frac3digit = fracStr.length >= 3 ? Number(fracStr[2]) : 0;
  const roundUp = frac3digit >= 5 ? 1n : 0n;

  const absPaise = intPaise + frac2 + roundUp;
  return negative ? -absPaise : absPaise;
}

export function formatPaise(paise: bigint): string {
  // Convert paise to rupees with two decimals, then apply Indian grouping.
  const absValue = paise < 0n ? -paise : paise;
  const rupees = Number(absValue) / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `${paise < 0n ? "-" : ""}₹${formatted}`;
}

export function sumPaise(values: bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}

export function paiseToString(paise: bigint): string {
  return paise.toString();
}
