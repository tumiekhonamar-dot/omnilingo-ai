const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Load multiple API keys from Environment Variables (comma separated)
// e.g., GEMINI_API_KEYS = "key1,key2,key3"
function getApiKeys() {
    const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    return keysString.split(',').map(k => k.trim()).filter(Boolean);
}

let currentKeyIndex = 0;

async function fetchWithKeyRotation(urlPath, requestBody) {
    const keys = getApiKeys();
    if (keys.length === 0) {
        throw new Error("No API keys configured on server.");
    }

    // Try keys sequentially if quota or error is hit
    for (let attempt = 0; attempt < keys.length; attempt++) {
        const apiKey = keys[currentKeyIndex];
        // Rotate index for the next request
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            // If quota exceeded or rate limited, try next key
            if (data.error) {
                if (data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED' || (data.error.message && data.error.message.includes('quota'))) {
                    continue; // try next key in loop
                }
                throw new Error(data.error.message);
            }

            if (data.candidates && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error("AI processing failed to generate content.");
            }
        } catch (err) {
            if (attempt === keys.length - 1) {
                throw err; // throw if all keys failed
            }
        }
    }
    throw new Error("All API keys are currently exhausted or experiencing high demand.");
}

app.post('/api/analyze', async (req, res) => {
    try {
        const { image, mimeType, query } = req.body;
        
        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: query },
                        ...(image ? [{ inlineData: { data: image, mimeType: mimeType } }] : [])
                    ]
                }
            ]
        };

        const resultText = await fetchWithKeyRotation('/api/analyze', requestBody);
        res.json({ success: true, result: resultText });

    } catch (err) {
        res.status(500).json({ error: err.message || "Server error occurred." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
