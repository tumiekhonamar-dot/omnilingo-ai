const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/analyze', async (req, res) => {
    try {
        const { image, mimeType, query } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: "API Key not configured on server." });
        }

        const promptText = `Analyze the provided image and user query: "${query}". 
        Provide your response structured clearly for a global audience:
        1. Understand: (Explain what is shown or the core issue)
        2. Step-by-step: (Provide clear logical sequential steps)
        3. Fix it: (Provide the final recommended solution or action)`;

        let contents = [promptText];
        if (image && mimeType) {
            contents.push({
                inlineData: { data: image, mimeType: mimeType }
            });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }, ...(image ? [{ inlineData: { data: image, mimeType: mimeType } }] : [])] }] })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0].content) {
            const textOutput = data.candidates[0].content.parts[0].text;
            res.json({ success: true, result: textOutput });
        } else {
            res.status(500).json({ error: data.error ? data.error.message : "AI processing failed." });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
