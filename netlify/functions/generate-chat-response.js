// netlify/functions/generate-chat-response.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- API Key from Environment Variable ---
// This function uses a single environment variable for your Gemini Flash API key.
// It must be set on Netlify.
const GEMINI_FLASH_API_KEY = process.env.GEMINI_FLASH_API_KEY; 

// Function to initialize the AI model with a specific key and model name
function initializeGeminiModel(apiKey, modelName) {
    if (!apiKey) {
        console.error(`ERROR: API key for ${modelName} is missing in Netlify environment variables.`);
        return null;
    }
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        return genAI.getGenerativeModel({ model: modelName });
    } catch (e) {
        console.error(`ERROR: Failed to initialize Gemini model ${modelName} with provided key:`, e);
        return null;
    }
}

exports.handler = async function(event, context) {
    // Enable CORS for all origins, which is necessary for your frontend on a different domain.
    const headers = {
        'Access-Control-Allow-Origin': '*', // Allows requests from any origin
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', // Important for JSON payloads
    };

    // Handle preflight OPTIONS request for CORS.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers: headers,
            body: '' 
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: headers,
            body: 'Method Not Allowed. Please use POST.'
        };
    }

    try {
        const { chatHistory, requestType } = JSON.parse(event.body);

        if (!chatHistory || !Array.isArray(chatHistory)) {
            console.error("Invalid request body: chatHistory array expected.");
            return {
                statusCode: 400,
                headers: headers,
                body: 'Invalid request body: chatHistory array expected.'
            };
        }

        const modelToUse = initializeGeminiModel(GEMINI_FLASH_API_KEY, "gemini-2.0-flash");
        const currentGeminiModelId = "gemini-2.0-flash";

        if (!modelToUse) {
            console.error("FATAL ERROR: Gemini Flash API key missing or invalid. Model cannot be initialized.");
            return {
                statusCode: 500,
                headers: headers,
                body: JSON.stringify({ success: false, error: "AI service not configured. Please ensure GEMINI_FLASH_API_KEY is set correctly on Netlify." })
            };
        }
        console.log(`Successfully initialized and using Gemini model: ${currentGeminiModelId}`);


        // --- Custom Logic for Creator Questions (though frontend handles it too, kept for robustness) ---
        const creatorKeywords = [
            "who made you", "who created you", "your creator", "your author",
            "who is your developer", "who built you", "who trained you", "who are you trained by"
        ];
        const customCreatorKeywords = [
            "who is calmash1", "what is calmash1", "tell me about calmash1",
            "who is grady hanson", "what is grady hanson", "tell me about grady hanson"
        ];

        const latestUserPrompt = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user' ? chatHistory[chatHistory.length - 1].parts[0].text.toLowerCase() : '';

        const isDirectCreatorQuestion = creatorKeywords.some(keyword => latestUserPrompt.includes(keyword));
        const isCustomCreatorFollowUp = customCreatorKeywords.some(keyword => latestUserPrompt.includes(keyword));

        let finalResponseText;

        if (isDirectCreatorQuestion || isCustomCreatorFollowUp) {
            finalResponseText = "I'm created by calmash1 also known as Grady Hanson.";
        } else if (requestType === 'generateChatName') {
            // This 'generateChatName' request type is not sent by your current HTML.
            // Keeping it here just in case you integrate a feature that uses it later.
            const nameGenerationPrompt = `Summarize the following conversation into a very short, descriptive chat title (max 5 words). Do NOT use quotes in the title.
            Conversation snippet:
            ${chatHistory.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n').substring(0, 1000)}
            Title:`;

            const nameResult = await modelToUse.generateContent(nameGenerationPrompt);
            const nameApiResponse = nameResult.response;
            let generatedName = nameApiResponse.text().trim();

            generatedName = generatedName.replace(/^['"]|['"]$/g, '');
            generatedName = generatedName.split('\n')[0];

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ success: true, chatName: generatedName })
            };

        } else {
            // --- Standard Content Generation ---
            // Sanitize chat history for the Gemini API call by replacing custom names with "Google".
            const sanitizedChatHistoryForGemini = chatHistory.map(msg => {
                if (msg.role === 'user' && msg.parts && msg.parts[0] && msg.parts[0].text) {
                    let text = msg.parts[0].text;
                    text = text.replace(/calmash1/gi, 'Google');
                    text = text.replace(/Grady Hanson/gi, 'Google');
                    return { ...msg, parts: [{ text }] };
                }
                return msg;
            });

            const result = await modelToUse.generateContent({ contents: sanitizedChatHistoryForGemini });
            const apiResponse = result.response;
            finalResponseText = apiResponse.text();

            // --- Apply "Google" to "calmash1" Branding Replacements ---
            const replacements = {
                /I am a large language model, trained by Google\./gi: "I am a large language model, trained by calmash1.",
                /I'm a large language model, trained by Google\./gi: "I'm a large language model, trained by calmash1.",
                /I am an AI assistant developed by Google\./gi: "I am an AI assistant developed by calmash1.",
                /I'm an AI assistant developed by Google\./gi: "I'm an AI assistant developed by calmash1.",
                /I was developed by Google\./gi: "I was developed by calmash1.",
                /I was trained by Google\./gi: "I was trained by calmash1.",
                /I am a Google-trained AI\./gi: "I am a calmash1-trained AI.",
                /trained by Google/gi: "trained by calmash1",
                /developed by Google/gi: "developed by calmash1",
                /Google's AI/gi: "calmash1's AI",
                /a Google product/gi: "a calmash1 product",
                /Google engineers/gi: "calmash1's developers",
                /my developers at Google/gi: "my developer, calmash1",
                /my creators at Google/gi: "my creator, calmash1"
            };

            for (const pattern in replacements) {
                finalResponseText = finalResponseText.replace(new RegExp(pattern, 'gi'), replacements[pattern]);
            }

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ success: true, text: finalResponseText })
            };
        }

    } catch (error) {
        console.error("Error processing Netlify Function request:", error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ success: false, error: error.message || "An internal server error occurred in the backend." })
        };
    }
};
