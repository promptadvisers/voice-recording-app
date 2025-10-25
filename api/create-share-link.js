module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { url, title, transcription, duration } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Create a compact data object
        const data = {
            u: url,
            t: title || undefined,
            tr: transcription || undefined,
            d: duration || undefined
        };

        // Remove undefined values
        Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);

        // Encode to base64
        const encoded = Buffer.from(JSON.stringify(data)).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        // Return the short URL
        const origin = req.headers.origin || req.headers.host || 'https://voice-recording-app.vercel.app';
        const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;
        const shortUrl = `${baseUrl}/s/${encoded}`;

        res.status(200).json({
            shortUrl,
            hash: encoded
        });
    } catch (error) {
        console.error('Error creating share link:', error);
        res.status(500).json({ error: 'Failed to create share link' });
    }
};
