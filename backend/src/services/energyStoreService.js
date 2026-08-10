export const ENERGY_PRODUCTS = {
  energy_small: { label: 'Energy Boost', amount: 50, priceUsd: 0.99 },
  energy_medium: { label: 'Full Refill', amount: 100, priceUsd: 1.99 },
  energy_large: { label: 'Mega Pack', amount: 150, priceUsd: 2.99 },
};

export function getProduct(productId) {
  return ENERGY_PRODUCTS[productId] ?? null;
}

export function listProducts() {
  return Object.entries(ENERGY_PRODUCTS).map(([id, product]) => ({
    id,
    ...product,
  }));
}

function validateMockReceipt(productId, receiptToken) {
  if (!receiptToken?.startsWith('mock_receipt_')) {
    return false;
  }
  return receiptToken.includes(productId);
}

export async function processRefill({ userId, productId, receiptToken }, queryFn) {
  const product = getProduct(productId);
  if (!product) {
    const err = new Error('Unknown product');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!validateMockReceipt(productId, receiptToken)) {
    const err = new Error('Invalid receipt token');
    err.status = 402;
    err.code = 'PAYMENT_FAILED';
    throw err;
  }

  const duplicate = await queryFn(
    `SELECT id FROM energy_purchases WHERE receipt_token = $1`,
    [receiptToken]
  );

  if (duplicate.rows.length > 0) {
    const err = new Error('Receipt already used');
    err.status = 409;
    err.code = 'RECEIPT_USED';
    throw err;
  }

  const { rows } = await queryFn(
    `UPDATE energy_state
     SET energy_remaining = LEAST(energy_remaining + $1, energy_max),
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING id, user_id, energy_remaining, energy_max, reset_at, updated_at`,
    [product.amount, userId]
  );

  if (rows.length === 0) {
    const err = new Error('Energy state not found');
    err.status = 404;
    throw err;
  }

  await queryFn(
    `INSERT INTO energy_purchases (user_id, product_id, energy_added, receipt_token)
     VALUES ($1, $2, $3, $4)`,
    [userId, productId, product.amount, receiptToken]
  );

  return { state: rows[0], product, energyAdded: product.amount };
}
