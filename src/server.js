require('dotenv').config();
const pool = require('./db');
const express = require('express');
const app = express();
const birouter = require('./routes/bid')

app.use(express.json());

app.use('/' , birouter);

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'ok' })
    } catch (err) {
        res.status(200).json({
            status: 'DB error'
        })
    }
})

const PORT = 3000 || process.env.PORT;
app.listen(PORT, () => { `Server is running on ${PORT}` })