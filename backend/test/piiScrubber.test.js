import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scrubPii, scrubTrainingRecord } from '../src/services/fineTuning/piiScrubber.js';

describe('pii scrubber', () => {
  it('redacts email addresses', () => {
    const out = scrubPii('Contact me at alice@example.com please');
    assert.equal(out, 'Contact me at [EMAIL] please');
  });

  it('redacts phone numbers and handles', () => {
    const out = scrubPii('Call 555-123-4567 or ping @secret_user');
    assert.ok(out.includes('[PHONE]'));
    assert.ok(out.includes('@[USER]'));
  });

  it('scrubs all messages in a training record', () => {
    const record = scrubTrainingRecord({
      messages: [
        { role: 'user', content: 'My email is bob@test.org' },
        { role: 'assistant', content: 'Got it @bob_handle' },
      ],
    });

    assert.equal(record.messages[0].content, 'My email is [EMAIL]');
    assert.equal(record.messages[1].content, 'Got it @[USER]');
  });
});
