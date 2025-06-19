// api/generate-chat-response.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

// IMPORTANT: This API key must be set as an Environment Variable in Vercel.
// On Vercel, go to your project settings -> Environment Variables.
// Add a variable with Name: GEMINI_FLASH_API_KEY and Value: your actual Gemini API key.
const GEMINI_FLASH_API_KEY = process.env.GEMINI_FLASH_API_KEY; 

// Helper function to initialize the Gemini model
function initializeGeminiModel(apiKey, modelName) {
    if (!apiKey) {
        console.error(`ERROR: API key for ${modelName} is missing in Vercel environment variables.`);
        return null; // Return null if API key is not found
    }
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        return genAI.getGenerativeModel({ model: modelName });
    } catch (e) {
        console.error(`ERROR: Failed to initialize Gemini model ${modelName} with provided key:`, e);
        return null;
    }
}

// Main Vercel serverless function handler
module.exports = async (req, res) => {
    // Set CORS headers to allow requests from your frontend hosted on a different domain.
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allows requests from any domain
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); // Allow POST and OPTIONS methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Allow Content-Type header

    // Handle preflight OPTIONS request (sent by browsers before a POST request)
    if (req.method === 'OPTIONS') {
        return res.status(204).send(''); // Respond with 204 No Content for successful preflight
    }

    // Ensure the request is a POST request
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed. Please use POST.' });
    }

    try {
        // Vercel's `req.body` automatically parses JSON for POST requests
        const { chatHistory, requestType } = req.body;

        // Basic validation for the incoming chat history
        if (!chatHistory || !Array.isArray(chatHistory)) {
            console.error("Invalid request body: chatHistory array expected.");
            return res.status(400).json({ success: false, error: 'Invalid request body: chatHistory array expected.' });
        }

        // Initialize the Gemini model using the API key from Vercel's environment variables.
        // We are hardcoding "gemini-2.0-flash" here as it's the model specified.
        const modelToUse = initializeGeminiModel(GEMINI_FLASH_API_KEY, "gemini-2.0-flash");
        const currentGeminiModelId = "gemini-2.0-flash"; // The model ID being used

        // If the model couldn't be initialized (likely due to a missing/invalid API key),
        // send a 500 error to the client.
        if (!modelToUse) {
            console.error("FATAL ERROR: Gemini Flash API key missing or invalid. Model cannot be initialized.");
            return res.status(500).json({ success: false, error: "AI service not configured. Please ensure GEMINI_FLASH_API_KEY is set correctly on Vercel." });
        }
        console.log(`Successfully initialized and using Gemini model: ${currentGeminiModelId}`);


        // --- Custom Logic for Creator Questions (branding) ---
        // These keywords will trigger a hardcoded response instead of calling the AI.
        const creatorKeywords = [
            "who made you", "who created you", "your creator", "your author",
            "who is your developer", "who built you", "who trained you", "who are you trained by"
        ];
        const customCreatorKeywords = [
            "who is calmash1", "what is calmash1", "tell me about calmash1",
            "who is grady hanson", "what is grady hanson", "tell me about grady hanson"
        ];

        // Get the last message from the user to check if it's a branding question
        const latestUserPrompt = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user' ? chatHistory[chatHistory.length - 1].parts[0].text.toLowerCase() : '';

        const isDirectCreatorQuestion = creatorKeywords.some(keyword => latestUserPrompt.includes(keyword));
        const isCustomCreatorFollowUp = customCreatorKeywords.some(keyword => latestUserPrompt.includes(keyword));

        let finalResponseText;

        // If a branding question is detected, return the hardcoded response.
        if (isDirectCreatorQuestion || isCustomCreatorFollowUp) {
            finalResponseText = "I'm created by calmash1 also known as Grady Hanson.";
        } else if (requestType === 'generateChatName') {
            // This `requestType` might be from an older frontend version;
            // Keeping it for backward compatibility if needed, though not used by your current HTML.
            const nameGenerationPrompt = `Summarize the following conversation into a very short, descriptive chat title (max 5 words). Do NOT use quotes in the title.
            Conversation snippet:
            ${chatHistory.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n').substring(0, 1000)}
            Title:`;

            const nameResult = await modelToUse.generateContent(nameGenerationPrompt);
            const nameApiResponse = nameResult.response;
            let generatedName = nameApiResponse.text().trim();

            generatedName = generatedName.replace(/^['"]|['"]$/g, '');
            generatedName = generatedName.split('\n')[0];

            return res.status(200).json({ success: true, chatName: generatedName });

        } else {
            // --- Standard AI Content Generation ---
            // Prepare chat history for the Gemini API.
            // Replace custom branding names (calmash1, Grady Hanson) with "Google" in user prompts
            // before sending to the actual Google Gemini API, so it understands context correctly.
            const sanitizedChatHistoryForGemini = chatHistory.map(msg => {
                if (msg.role === 'user' && msg.parts && msg.parts[0] && msg.parts[0].text) {
                    let text = msg.parts[0].text;
                    text = text.replace(/calmash1/gi, 'Google');
                    text = text.replace(/Grady Hanson/gi, 'Google');
                    return { ...msg, parts: [{ text }] };
                }
                return msg; // Return other messages (like previous AI responses) as is
            });

            // Make the actual call to the Gemini API
            const result = await modelToUse.generateContent({ contents: sanitizedChatHistoryForGemini });
            const apiResponse = result.response;
            finalResponseText = apiResponse.text();

            // --- Apply "Google" to "calmash1" Branding Replacements to AI's Response ---
            // After getting the response from Gemini, replace "Google" with "calmash1"
            // in specific phrases related to the AI's origin/training.
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

            // Send the final processed text back to the frontend
            return res.status(200).json({ success: true, text: finalResponseText });
        }

    } catch (error) {
        // Log the error for debugging on Vercel's console
        console.error("Error processing Vercel function request:", error);
        // Send a 500 Internal Server Error response to the client
        return res.status(500).json({ success: false, error: error.message || "An internal server error occurred in the backend." });
    }
};
          
