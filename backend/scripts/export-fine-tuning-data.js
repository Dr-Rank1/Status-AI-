#!/usr/bin/env node
/**
 * One-shot fine-tuning JSONL export (same pipeline as the scheduled worker).
 *
 * Usage: node backend/scripts/export-fine-tuning-data.js
 */

import dotenv from 'dotenv';
import { runFineTuningExportWorker } from '../src/workers/fineTuningExportWorker.js';

dotenv.config();

const result = await runFineTuningExportWorker();
if (result) {
  console.log(`Exported ${result.count} records → ${result.filePath}`);
} else {
  console.log('Export skipped or produced no output.');
}

process.exit(0);
