/**
 * Money is stored as whole-number integers (IQD, no floating point). This
 * formats with thousands separators, e.g. `12,500 IQD`. Always wrap the
 * rendered output in the `.ltr-nums` CSS class in JSX contexts that may be
 * RTL (Kurdish), so the number doesn't visually reverse — see globals.css.
 */
export function formatMoney(amount: number, currency = "IQD"): string {
  return `${amount.toLocaleString("en-US")} ${currency}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
