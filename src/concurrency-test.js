const { v4: uuidv4 } = require('uuid');

const AUCTION_ID = '769d0815-ffa3-47d8-b35f-c61cf6536f9b';
const NUM_BIDS = 50;
const BASE_URL = 'http://localhost:3000/bid';

async function fireBid(i) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auction_id: AUCTION_ID,
      user_id: uuidv4(),          // valid UUID now
      amount: 100 + i,
      idempotency_key: `concurrent-req-${i}-${Date.now()}`,
    }),
  });
  const data = await res.json();
  return { i, amount: 100 + i, httpStatus: res.status, raw: data };
}

async function run() {
  const promises = [];
  for (let i = 0; i < NUM_BIDS; i++) {
    promises.push(fireBid(i));
  }

  const results = await Promise.all(promises);

  const accepted = results.filter(r => r.raw.status === 'accepted');
  const rejected = results.filter(r => r.raw.status !== 'accepted');

  console.log(`Total requests: ${results.length}`);
  console.log(`Accepted: ${accepted.length}`);
  console.log(`Rejected: ${rejected.length}`);
  console.log('Accepted bid amounts:', accepted.map(a => a.amount));
  console.log('Sample rejected reasons:', rejected.slice(0, 5).map(r => r.raw));
}

run();