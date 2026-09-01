# Auction Bidding Service

A small backend service exposing a single `POST /bid` endpoint for an auction platform. Built as a scoped take-home exercise — the focus is on correct bidding logic under concurrency, not auth, rate limiting, or deployment.

## Stack

- Node.js + Express
- PostgreSQL (`pg` driver, connection pooling)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the database

```bash
psql -U postgres
```

```sql
CREATE DATABASE auction_service;
\q
```

### 3. Configure environment

Create a `.env` file in the project root:

```
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/auction_service
PORT=3000
```

### 4. Apply the schema

```bash
psql -U postgres -d auction_service -f init.sql
```

### 5. Seed test data

```bash
node src/seed.js
```

This creates two auctions: one open (closes 1 hour from now) and one already closed (closed 1 hour ago) — useful for testing the close-boundary case. The script prints both auctions' IDs to the console.

### 6. Run the server

```bash
npm run dev
```

Server starts on `http://localhost:3000`. Confirm it's up:

```bash
curl http://localhost:3000/health
```

## Data model

```sql
auctions (
  id                     UUID PRIMARY KEY,
  item_name              TEXT,
  current_top_bid        NUMERIC(12,2),
  current_top_bidder_id  UUID,
  closes_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ
)

bids (
  id               UUID PRIMARY KEY,
  auction_id       UUID REFERENCES auctions(id),
  user_id          UUID,
  amount           NUMERIC(12,2),
  status           TEXT,          -- 'accepted' | 'rejected'
  reject_reason    TEXT,
  idempotency_key  TEXT UNIQUE,
  created_at       TIMESTAMPTZ
)
```

**Why this shape:** the current top bid is stored directly on the auction row instead of being calculated from the bid history each time. This makes "is this bid high enough" a single fast lookup rather than a scan over what could be thousands of past bids.

## API

### `POST /bid`

**Request body:**

```json
{
  "auction_id": "uuid",
  "user_id": "uuid",
  "amount": 150,
  "idempotency_key": "any-unique-string-per-attempt"
}
```

**Responses:**

| Status  | Meaning                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------- |
| `200` | Bid accepted (or a replayed accepted result)                                                       |
| `409` | Bid rejected — see`reject_reason` (`bid_too_low`, `auction_closed`, `already_top_bidder`) |
| `404` | Auction not found                                                                                  |
| `400` | Missing or invalid fields                                                                          |
| `500` | Unexpected server error                                                                            |

**Response body:**

```json
{
  "replayed": false,
  "status": "accepted",
  "reject_reason": null,
  "bid_id": "uuid"
}
```

## How the key requirements are handled

**Only strictly higher bids win.** The submitted amount must be greater than `current_top_bid` — ties or lower amounts are rejected.

**Concurrency safety.** Each bid runs inside a database transaction that takes a row-level lock (`SELECT ... FOR UPDATE`) on the target auction before checking anything or writing. This serializes bids *per auction* — two bids on the same auction can never both be accepted as top bid — while bids on different auctions are unaffected and still process in parallel. Verified by firing 50 truly simultaneous bids at one auction and confirming the final stored top bid matched the actual highest amount submitted.

**Auction-close boundary.** The server's own clock decides this, not the client's. If `now() >= closes_at` at the moment the bid is processed (inside the same locked transaction), it's rejected with `auction_closed`.

**Duplicate / retried requests.** The client sends an `idempotency_key`. If that key has already been processed, the server returns the original stored result instead of reprocessing. A `UNIQUE` constraint on the column is the hard backstop for the case where two identical retries somehow arrive at the same instant.

**Self-bidding.** If the current top bidder submits another bid on the same auction, it's rejected with `already_top_bidder` — they're already winning, so there's nothing for it to accomplish, and it may indicate a client-side bug.

## Testing

* [ ] Manual scenario testing via curl/Postman, plus a concurrency script at `src/concurrency-test.js` that fires many simultaneous bids at one auction using `Promise.all()` and checks the database lands on the correct final top bid.
