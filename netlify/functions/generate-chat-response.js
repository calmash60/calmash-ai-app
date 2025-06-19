// netlify/functions/generate-chat-response.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- API Keys from Environment Variables ---
// These are loaded from Netlify's environment settings, not hardcoded here.
// Key for the default 'calmash 1.0' option (will use gemini-2.0-flash)
const GEMINI_PRO_API_KEY = process.env.GEMINI_PRO_API_KEY; 
// Key for the 'calmash 1.0 flash' option (will also use gemini-2.0-flash)
const GEMINI_FLASH_API_KEY = process.env.GEMINI_FLASH_API_KEY; 

// Function to initialize the AI model with a specific key and model name
function initializeGeminiModel(apiKey, modelName) {
    if (!apiKey) {
        console.error(`API key missing for model: ${modelName}`);
        return null;
    }
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        return genAI.getGenerativeModel({ model: modelName });
    } catch (e) {
        console.error(`Failed to initialize Gemini model ${modelName} with provided key:`, e);
        return null;
    }
}

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed. Please use POST.'
        };
    }

    try {
        const { chatHistory, selectedModelId, requestType } = JSON.parse(event.body);

        if (!chatHistory || !Array.isArray(chatHistory)) {
            console.error("Invalid request body: chatHistory array expected.");
            return {
                statusCode: 400,
                body: 'Invalid request body: chatHistory array expected.'
            };
        }

        let modelToUse = null; // The actual Gemini model instance
        const targetModelName = "gemini-2.0-flash"; // Both options use this model

        // Determine which specific Flash API key to use based on the selectedModelId
        if (selectedModelId === "calmash_1_0_flash") {
            modelToUse = initializeGeminiModel(GEMINI_FLASH_API_KEY, targetModelName);
            if (!modelToUse) {
                // Fallback to the 'pro' named key if 'flash' named key is missing/invalid
                console.warn("GEMINI_FLASH_API_KEY (for 'calmash 1.0 flash') not configured or invalid. Falling back to GEMINI_PRO_API_KEY.");
                modelToUse = initializeGeminiModel(GEMINI_PRO_API_KEY, targetModelName);
            }
        } else { // Default to 'calmash_1_0' (uses the 'pro' named key)
            modelToUse = initializeGeminiModel(GEMINI_PRO_API_KEY, targetModelName);
            if (!modelToUse) {
                // Fallback to the 'flash' named key if 'pro' named key is missing/invalid
                console.warn("GEMINI_PRO_API_KEY (for 'calmash 1.0') not configured or invalid. Attempting to use GEMINI_FLASH_API_KEY as last resort.");
                modelToUse = initializeGeminiModel(GEMINI_FLASH_API_KEY, targetModelName);
            }
        }

        if (!modelToUse) {
            console.error("FATAL ERROR: No valid Gemini Flash API key could be initialized using either GEMINI_PRO_API_KEY or GEMINI_FLASH_API_KEY.");
            return {
                statusCode: 500,
                body: JSON.stringify({ success: false, error: "AI service not configured. Please check your Gemini Flash API keys on Netlify." })
            };
        }
        console.log(`Using Gemini model: ${targetModelName}`);


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
            // Hardcoded response for direct creator questions or follow-ups about calmash1/Grady Hanson
            finalResponseText = "I'm created by calmash1 also known as Grady Hanson.";
        } else if (requestType === 'generateChatName') {
            // Logic for generating chat name
            const nameGenerationPrompt = `Summarize the following conversation into a very short, descriptive chat title (max 5 words). Do NOT use quotes in the title.
            Conversation snippet:
            ${chatHistory.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n').substring(0, 1000)}
            Title:`; // Limit snippet length to avoid too many tokens

            const nameResult = await modelToUse.generateContent(nameGenerationPrompt);
            const nameApiResponse = nameResult.response;
            let generatedName = nameApiResponse.text().trim();

            // Clean up common AI naming artifacts
            generatedName = generatedName.replace(/^['"]|['"]$/g, ''); // Remove leading/trailing quotes
            generatedName = generatedName.split('\n')[0]; // Take only the first line

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ success: true, chatName: generatedName })
            };

        } else {
            // Standard content generation
            const sanitizedChatHistoryForGemini = chatHistory.map(msg => {
                if (msg.role === 'user' && msg.parts && msg.parts[0] && msg.parts[0].text) {
                    let text = msg.parts[0].text;
                    // Replace custom names back to "Google" for the actual model call to understand context correctly
                    text = text.replace(/calmash1/gi, 'Google');
                    text = text.replace(/Grady Hanson/gi, 'Google');
                    return { ...msg, parts: [{ text }] };
                }
                return msg;
            });

            const result = await modelToUse.generateContent({ contents: sanitizedChatHistoryForGemini });
            const apiResponse = result.response;
            finalResponseText = apiResponse.text();

            // Apply specific "Google" to "calmash1" replacements ONLY for AI's self-descriptive phrases
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ success: true, text: finalResponseText })
            };
        }

    } catch (error) {
        console.error("Error in Netlify Function:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, error: error.message || "An internal server error occurred." })
        };
    }
};
