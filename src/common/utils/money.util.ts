const CURRENCY_SCALE: Record<string, number> = {
  BHD: 3,
  JPY: 0,
  KWD: 3,
  KRW: 0,
  OMR: 3,
  USD: 2,
  EUR: 2,
  GBP: 2,
  PKR: 2,
  AED: 2,
  SAR: 2,
  INR: 2,
  CNY: 2,
};

export function scaleOf(currency: string): number {
  return CURRENCY_SCALE[currency.toUpperCase()] ?? 2;
}

export function parseDecimal(value: string | number, scale: number): bigint {
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid monetary amount: ${raw}`);
  }
  const negative = raw.startsWith('-');
  const [ints, frac = ''] = raw.replace('-', '').split('.');
  let fraction = frac;
  if (fraction.length > scale) {
    const extra = fraction.slice(scale);
    if (!/^0+$/.test(extra)) {
      throw new Error(`Amount ${raw} exceeds currency scale ${scale}`);
    }
    fraction = fraction.slice(0, scale);
  }
  const padded = fraction.padEnd(scale, '0');
  const minor =
    BigInt(ints || '0') * 10n ** BigInt(scale) + BigInt(padded || '0');
  return negative ? -minor : minor;
}

export function formatDecimal(minor: bigint, scale: number): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const base = 10n ** BigInt(scale);
  const ints = abs / base;
  const frac = (abs % base).toString().padStart(scale, '0');
  const body = scale === 0 ? ints.toString() : `${ints.toString()}.${frac}`;
  return negative ? `-${body}` : body;
}

export function addAmounts(
  a: string,
  b: string,
  currency: string,
): string {
  const scale = scaleOf(currency);
  return formatDecimal(parseDecimal(a, scale) + parseDecimal(b, scale), scale);
}

export function subAmounts(
  a: string,
  b: string,
  currency: string,
): string {
  const scale = scaleOf(currency);
  return formatDecimal(parseDecimal(a, scale) - parseDecimal(b, scale), scale);
}

export function compareAmounts(
  a: string,
  b: string,
  currency: string,
): number {
  const scale = scaleOf(currency);
  const left = parseDecimal(a, scale);
  const right = parseDecimal(b, scale);
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export function mulAmountByInt(
  amount: string,
  quantity: number,
  currency: string,
): string {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Quantity must be a non-negative integer');
  }
  const scale = scaleOf(currency);
  return formatDecimal(parseDecimal(amount, scale) * BigInt(quantity), scale);
}

export function zeroAmount(currency: string): string {
  return formatDecimal(0n, scaleOf(currency));
}

export function clampRemaining(obligation: string, confirmed: string, currency: string) {
  const remainingRaw = subAmounts(obligation, confirmed, currency);
  const overpaid =
    compareAmounts(confirmed, obligation, currency) > 0
      ? subAmounts(confirmed, obligation, currency)
      : zeroAmount(currency);
  const remaining =
    compareAmounts(remainingRaw, zeroAmount(currency), currency) < 0
      ? zeroAmount(currency)
      : remainingRaw;
  return { remaining, overpaid };
}

export function sumAmounts(amounts: string[], currency: string): string {
  return amounts.reduce(
    (total, amount) => addAmounts(total, amount, currency),
    zeroAmount(currency),
  );
}
