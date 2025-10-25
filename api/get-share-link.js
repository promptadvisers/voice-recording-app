module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { hash } = req.query;

        if (!hash) {
            return res.status(400).json({ error: 'Hash is required' });
        }

        // Decode from base64
        const base64 = hash
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        // Add padding if needed
        const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);

        const decoded = Buffer.from(padded, 'base64').toString('utf-8');
        const data = JSON.parse(decoded);

        // Convert back to full format
        const result = {
            url: data.u,
            title: data.t || null,
            transcription: data.tr || null,
            duration: data.d || null
        };

        res.status(200).json(result);
    } catch (error) {
        console.error('Error retrieving share link:', error);
        res.status(400).json({ error: 'Invalid or corrupted share link' });
    }
};
