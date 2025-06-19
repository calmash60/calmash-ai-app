// netlify/functions/generate-chat-response.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- API Key from Environment Variable ---
// This function uses a single environment variable for your Gemini Flash API key.
// It must be set on Netlify.
const GEMINI_FLASH_API_KEY = process.env.GEMINI_FLASH_API_KEY; 

// Function to initialize the AI model with a specific key and model name
function initializeGeminiModel(apiKey, modelName) {
    if (!apiKey) {
        // Log a more descriptive error if API key is missing
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
    // In a production environment, you might want to restrict this to specific origins (e.g., your Netlify site URL).
    const headers = {
        'Access-Control-Allow-Origin': '*', // Allows requests from any origin
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', // Important for JSON payloads
    };

    // Handle preflight OPTIONS request for CORS. Browsers send this before the actual POST.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers: headers,
            body: '' // No body for OPTIONS request
        };
    }

    // Only allow POST requests for actual content generation
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: headers,
            body: 'Method Not Allowed. Please use POST.'
        };
    }

    try {
        // Parse the request body. The frontend sends 'chatHistory' and 'requestType'.
        // 'selectedModelId' is no longer sent from your current HTML, so we don't expect it.
        const { chatHistory, requestType } = JSON.parse(event.body);

        // Basic validation for chatHistory
        if (!chatHistory || !Array.isArray(chatHistory)) {
            console.error("Invalid request body: chatHistory array expected.");
            return {
                statusCode: 400,
                headers: headers,
                body: 'Invalid request body: chatHistory array expected.'
            };
        }

        // Initialize the Gemini model. This backend simplifies to always use gemini-2.0-flash
        // with the single API key you will provide.
        const modelToUse = initializeGeminiModel(GEMINI_FLASH_API_KEY, "gemini-2.0-flash");
        const currentGeminiModelId = "gemini-2.0-flash"; // Confirming which model is used

        // If model initialization failed (e.g., missing or invalid API key), return a 500 error.
        if (!modelToUse) {
            console.error("FATAL ERROR: Gemini Flash API key missing or invalid. Model cannot be initialized.");
            return {
                statusCode: 500,
                headers: headers,
                body: JSON.stringify({ success: false, error: "AI service not configured. Please ensure GEMINI_FLASH_API_KEY is set correctly on Netlify." })
            };
        }
        console.log(`Successfully initialized and using Gemini model: ${currentGeminiModelId}`);


        // --- Custom Logic for Creator Questions (handled directly by frontend now, but kept here for robustness) ---
        // The frontend HTML you provided handles this directly, but if this backend was used
        // by a different frontend, it would still respond appropriately for these keywords.
        const creatorKeywords = [
            "who made you", "who created you", "your creator", "your author",
            "who is your developer", "who built you", "who trained you", "who are you trained by"
        ];
        const customCreatorKeywords = [
            "who is calmash1", "what is calmash1", "tell me about calmash1",
            "who is grady hanson", "what is grady hanson", "tell me about grady hanson"
        ];

        // Get the latest user prompt to check for creator-related questions
        const latestUserPrompt = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user' ? chatHistory[chatHistory.length - 1].parts[0].text.toLowerCase() : '';

        const isDirectCreatorQuestion = creatorKeywords.some(keyword => latestUserPrompt.includes(keyword));
        const isCustomCreatorFollowUp = customCreatorKeywords.some(keyword => latestUserPrompt.includes(keyword));

        let finalResponseText;

        if (isDirectCreatorQuestion || isCustomCreatorFollowUp) {
            // Hardcoded response for direct creator questions or follow-ups about calmash1/Grady Hanson
            finalResponseText = "I'm created by calmash1 also known as Grady Hanson.";
        } else if (requestType === 'generateChatName') {
            // This 'generateChatName' request type is from older HTML versions; not expected with your current one.
            // Keeping it here for robustness, in case you use a frontend that sends this.
            const nameGenerationPrompt = `Summarize the following conversation into a very short, descriptive chat title (max 5 words). Do NOT use quotes in the title.
            Conversation snippet:
            ${chatHistory.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n').substring(0, 1000)}
            Title:`;

            const nameResult = await modelToUse.generateContent(nameGenerationPrompt);
            const nameApiResponse = nameResult.response;
            let generatedName = nameApiResponse.text().trim();

            generatedName = generatedName.replace(/^['"]|['"]$/g, ''); // Remove leading/trailing quotes
            generatedName = generatedName.split('\n')[0]; // Take only the first line

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ success: true, chatName: generatedName })
            };

        } else {
            // --- Standard Content Generation ---
            // Prepare chat history for the Gemini API call.
            // Replace custom names back to "Google" for the actual model call to understand context correctly.
            const sanitizedChatHistoryForGemini = chatHistory.map(msg => {
                if (msg.role === 'user' && msg.parts && msg.parts[0] && msg.parts[0].text) {
                    let text = msg.parts[0].text;
                    text = text.replace(/calmash1/gi, 'Google');
                    text = text.replace(/Grady Hanson/gi, 'Google');
                    return { ...msg, parts: [{ text }] };
                }
                return msg; // Return other messages as is (e.g., 'model' roles)
            });

            const result = await modelToUse.generateContent({ contents: sanitizedChatHistoryForGemini });
            const apiResponse = result.response;
            finalResponseText = apiResponse.text();

            // --- Apply "Google" to "calmash1" Replacements for AI's Self-Descriptive Phrases ---
            // This is the branding replacement you wanted.
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

            // Return success response with the generated text
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ success: true, text: finalResponseText })
            };
        }

    } catch (error) {
        // Log the full error for debugging on Netlify
        console.error("Error processing Netlify Function request:", error);
        // Return a 500 Internal Server Error for any unhandled exceptions
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ success: false, error: error.message || "An internal server error occurred in the backend." })
        };
    }
};
