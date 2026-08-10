import { query } from '../config/database.js';
import { getEnergyState, ENERGY_COSTS } from '../services/energyService.js';
import { listProducts, processRefill } from '../services/energyStoreService.js';

export async function getMyEnergyState(req, res) {
  const state = await getEnergyState(req.user.id);

  if (!state) {
    return res.status(404).json({ error: 'Energy state not found' });
  }

  res.json({ data: state, costs: ENERGY_COSTS, products: listProducts() });
}

export async function listStoreProducts(_req, res) {
  res.json({ data: listProducts() });
}

export async function refillEnergy(req, res) {
  const { productId, receiptToken } = req.body;

  if (!productId || !receiptToken) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'productId and receiptToken are required',
    });
  }

  try {
    const result = await processRefill(
      { userId: req.user.id, productId, receiptToken },
      query
    );

    res.json({
      data: result.state,
      energyAdded: result.energyAdded,
      product: result.product,
    });
  } catch (err) {
    res.status(err.status ?? 500).json({
      error: err.code ?? 'INTERNAL_ERROR',
      message: err.message,
    });
  }
}

export async function getEnergyStateById(req, res) {
  const state = await getEnergyState(req.params.userId);

  if (!state) {
    return res.status(404).json({ error: 'Energy state not found' });
  }

  res.json({ data: state, costs: ENERGY_COSTS });
}
