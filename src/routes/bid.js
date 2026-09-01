const express = require('express');
const pool = require('../db');

const router = express.Router();

router.post('/bid', async (req, res) => {

    const { auction_id, user_id, amount, idempotency_key } = req.body;

    if (!auction_id || !user_id || amount == null || !idempotency_key) {
        return res.status(400).json({
            message: 'auction_id, user_id, amount, idempotency_key are required!',
            condition: false
        })
    }

    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
            message: 'amount should be positive',
            condition: false
        })
    }

    const client = await pool.connect();

    try {

        // Use `client` here, not `pool` — avoid holding two connections at once
        const existing = await client.query(
            'SELECT * FROM bids WHERE idempotency_key = $1',
            [idempotency_key]
        );

        if (existing.rows.length > 0) {
            const prior = existing.rows[0];
            return res.status(prior.status === 'accepted' ? 200 : 409).json({
                replayed: true,
                status: prior.status,
                reject_reason: prior.reject_reason,
                bid_id: prior.id,
            });
        }

        await client.query('BEGIN');

        const auctionResult = await client.query(
            "SELECT * FROM auctions WHERE id = $1 FOR UPDATE",
            [auction_id]
        );

        // FIX: was auctionResult.length (undefined, always false) — must be .rows.length
        if (auctionResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "auction not found",
                condition: false
            })
        }

        const auction = auctionResult.rows[0];

        const now = new Date();
        const closesAt = new Date(auction.closes_at);

        let status = 'accepted';
        let rejectReason = null;

        if (now >= closesAt) {
            status = 'rejected';
            rejectReason = 'auction closed';
        } else if (Number(amount) <= Number(auction.current_top_bid)) {
            status = 'rejected';
            rejectReason = 'bid amount is too low';
        } else if (auction.current_top_bidder_id === user_id) {
            status = 'rejected';
            rejectReason = 'user is already top bidder';
        }

        // FIX: was `status = 'accepted'` (assignment, always truthy) — must be ===
        if (status === 'accepted') {
            await client.query(
                `UPDATE auctions
                SET current_top_bid = $1, current_top_bidder_id = $2
                WHERE id = $3`,
                [amount, user_id, auction_id]
            )
        }

        const inserted = await client.query(
            `INSERT INTO bids (auction_id, user_id, amount, status, reject_reason, idempotency_key)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [auction_id, user_id, amount, status, rejectReason, idempotency_key]
        )

        await client.query('COMMIT');

        const bid = inserted.rows[0];

        return res.status(status === 'accepted' ? 200 : 409).json({
            replayed: false,
            status: bid.status,
            reject_reason: bid.reject_reason,
            bid_id: bid.id,
        });

    } catch (e) {
        console.log(e);
        await client.query('ROLLBACK').catch(() => { });

        // Unique violation on idempotency_key = a concurrent retry beat us here
        if (e.code === '23505') {
            const retry = await pool.query(
                'SELECT * FROM bids WHERE idempotency_key = $1',
                [idempotency_key]
            );
            const prior = retry.rows[0];
            return res.status(prior.status === 'accepted' ? 200 : 409).json({
                replayed: true,
                status: prior.status,
                reject_reason: prior.reject_reason,
                bid_id: prior.id,
            });
        }

        return res.status(500).json({ error: 'internal server error' });

    } finally {
        client.release();
    }
})

module.exports = router;