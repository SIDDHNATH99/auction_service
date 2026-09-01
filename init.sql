CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE auctions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name             TEXT NOT NULL,
  current_top_bid       NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_top_bidder_id UUID,
  closes_at             TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bids (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id      UUID NOT NULL REFERENCES auctions(id),
  user_id         UUID NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  status          TEXT NOT NULL,
  reject_reason   TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bids_auction_id ON bids(auction_id);