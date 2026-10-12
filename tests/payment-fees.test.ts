import assert from "node:assert/strict";
import { test } from "node:test";
import { providerFee, quoteCollection, quotePayout } from "../src/lib/payment-fees";

test("member-paid collection fees preserve the intended savings share", () => {
  assert.deepEqual(quoteCollection(5000), { creditAmount: 5000, walletAmount: 5128, fee: 128 });
  assert.deepEqual(quotePayout(10000), { walletAmount: 10000, fee: 250, accountAmount: 10250 });
  assert.equal(providerFee(100), 2);
  for (const rate of [0, 100, 250, 399])
    for (let net = 100; net <= 100000; net += 397) {
      const quote = quoteCollection(net, rate);
      assert.equal(quote.walletAmount - providerFee(quote.walletAmount, rate), net);
      assert.ok(quote.walletAmount === 0 || quote.walletAmount - 1 - providerFee(quote.walletAmount - 1, rate) < net);
    }
});

test("quotes reject invalid whole-franc amounts and fee rates", () => {
  for (const amount of [-1, NaN, Infinity, 1.5]) assert.throws(() => quoteCollection(amount));
  for (const rate of [-1, 10000, NaN, 2.5]) assert.throws(() => quotePayout(10000, rate));
});
test("small final repayments meet the provider minimum and disclose surplus for savings", () => {
  const quote = quoteCollection(17);
  assert.equal(quote.walletAmount, 100);
  assert.equal(quote.fee, 2);
  assert.equal(quote.walletAmount - quote.fee - quote.creditAmount, 81);
});
