const fs = require('fs');
const path = require('path');
const https = require('https');

// (Polyfills are now handled in polyfills.js at application startup)

// The pdf-parse library usually exports the function directly.
// We load it defensively to avoid potential issues with internal Node calls.
let pdf;
try {
    const pdfLib = require('pdf-parse');
    pdf = typeof pdfLib === 'function' ? pdfLib : pdfLib.default;
} catch (e) {
    console.error('[CRITICAL] Failed to load pdf-parse library:', e.message);
}

/**
 * Handles the logic for parsing contract data using OpenAI.
 * Supports both Image (Vision) and PDF (Text Extraction).
 */
async function parseContractFile(filePath, apiKey) {
    if (path.extname(filePath).toLowerCase() === '.pdf' && !pdf) {
        return { error: 'LIB_MISSING', message: 'PDF parsing engine failed to initialize. Please use image scans instead.' };
    }

    const extension = path.extname(filePath).toLowerCase();

    if (extension === '.pdf') {
        return await parsePdfContract(filePath, apiKey);
    } else {
        return await parseImageContract(filePath, extension, apiKey);
    }
}

/**
 * Extracts text from a digital PDF and sends it to GPT-4o for structured extraction.
 */
async function parsePdfContract(filePath, apiKey) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        const textContent = data.text;

        if (!textContent || textContent.trim().length < 50) {
            // If the PDF is just a scan (no text), it will likely fail here or return empty.
            // In a more advanced version, we could convert PDF pages to images and use Vision.
            return {
                error: 'SCANNED_PDF',
                message: 'This PDF appears to be a scan with no selectable text. Please upload it as a JPG or PNG image for AI analysis.'
            };
        }

        const prompt = `You are an agricultural contract analyst. Extract contract details from the provided text into a structured JSON format. 
        Fields: buyer, destination, grade, netKg (number), pricePerKg (number), totalValue (number), status (use "Ready"), etd (YYYY-MM-DD).
        
        Contract Text:
        ${textContent.substring(0, 10000)} // Limit text size`;

        return await callOpenAI(prompt, null, apiKey);

    } catch (err) {
        console.error('PDF Parse Error:', err);
        return { error: 'PARSE_ERROR', message: `Failed to read PDF: ${err.message}` };
    }
}

/**
 * Uses GPT-4o Vision to extract data from an image.
 */
async function parseImageContract(filePath, extension, apiKey) {
    try {
        const fileBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
        const mimeType = `image/${extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : extension.substring(1)}`;

        const prompt = 'You are an agricultural contract analyst. Extract contract details from the provided document into a structured JSON format. Fields: buyer, destination, grade, netKg (number), pricePerKg (number), totalValue (number), status (use "Ready"), etd (YYYY-MM-DD).';

        return await callOpenAI(prompt, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } }, apiKey);

    } catch (err) {
        console.error('Image Parse Error:', err);
        return { error: 'PARSE_ERROR', message: `Failed to process image: ${err.message}` };
    }
}

/**
 * Common helper to call OpenAI API with JSON response format.
 */
async function callOpenAI(systemPrompt, userContent, apiKey) {
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent ? [{ type: 'text', text: 'Extract data.' }, userContent] : 'Extract data from text.' }
    ];

    const payload = {
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 1000,
        response_format: { type: "json_object" }
    };

    const body = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) resolve({ error: 'API_ERROR', message: parsed.error.message });
                    else {
                        const content = JSON.parse(parsed.choices[0].message.content);
                        resolve({ success: true, data: content });
                    }
                } catch (e) { resolve({ error: 'PARSE_ERROR', message: e.message }); }
            });
        });

        req.on('error', (e) => resolve({ error: 'NETWORK_ERROR', message: e.message }));
        req.write(body);
        req.end();
    });
}

module.exports = { parseContractFile };
