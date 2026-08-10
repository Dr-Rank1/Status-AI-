import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProduct,
  listProducts,
} from '../src/services/energyStoreService.js';

describe('energyStoreService', () => {
  it('lists known products', () => {
    const products = listProducts();
    assert.ok(products.length >= 3);
    assert.ok(products.every((p) => p.id && p.amount > 0));
  });

  it('returns null for unknown product', () => {
    assert.equal(getProduct('invalid_product'), null);
  });

  it('returns product metadata', () => {
    const product = getProduct('energy_small');
    assert.equal(product.label, 'Energy Boost');
    assert.equal(product.amount, 50);
  });
});
