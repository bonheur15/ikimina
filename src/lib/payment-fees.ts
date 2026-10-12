export const DEFAULT_FEE_BPS = 250;

function validate(amount: number, feeBps: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isInteger(feeBps) || feeBps < 0 || feeBps >= 10_000)
    throw new Error("Invalid payment fee quote.");
}

export function providerFee(amount: number, feeBps = DEFAULT_FEE_BPS) {
  validate(amount, feeBps);
  // XendlyPay rounds its fee down to whole francs.
  return Math.floor((amount * feeBps) / 10_000);
}

export function quoteCollection(creditAmount: number, feeBps = DEFAULT_FEE_BPS) {
  validate(creditAmount, feeBps);
  const walletAmount =
    creditAmount === 0 ? 0 : Math.max(100, Math.floor(((creditAmount - 1) * 10_000) / (10_000 - feeBps)) + 1);
  return { creditAmount, walletAmount, fee: providerFee(walletAmount, feeBps) };
}

export function quotePayout(walletAmount: number, feeBps = DEFAULT_FEE_BPS) {
  validate(walletAmount, feeBps);
  const fee = providerFee(walletAmount, feeBps);
  return { walletAmount, fee, accountAmount: walletAmount + fee };
}
