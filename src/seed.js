require('dotenv').config();
const pool = require('./db');

async function seed() {
  // Clear existing data (dev convenience only)
  await pool.query('DELETE FROM bids');
  await pool.query('DELETE FROM auctions');

  const openAuction = await pool.query(
    `INSERT INTO auctions (item_name, current_top_bid, closes_at)
     VALUES ($1, $2, now() + interval '1 hour')
     RETURNING *`,
    ['Vintage Watch', 100.00]
  );

  const closedAuction = await pool.query(
    `INSERT INTO auctions (item_name, current_top_bid, closes_at)
     VALUES ($1, $2, now() - interval '1 hour')
     RETURNING *`,
    ['Old Painting', 50.00]
  );

  console.log('Seeded open auction:', openAuction.rows[0]);
  console.log('Seeded closed auction:', closedAuction.rows[0]);

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});