// netlify/functions/generate-chat-response.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

// This function will be triggered by Netlify's build process,
// so process.env.GEMINI_API_KEY will come from Netlify's environment variables.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY environment variable is not set.");
    // In a production app, you might want a more robust error handling
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed. Please use POST.'
        };
    }

    try {
        const { chatHistory } = JSON.parse(event.body);

        if (!chatHistory || !Array.isArray(chatHistory)) {
            console.error("Invalid request body:", event.body);
            return {
                statusCode: 400,
                body: 'Invalid request body: chatHistory array expected.'
            };
        }

        const creatorKeywords = ["who made you", "who created you", "your creator", "your author", "who is your developer", "who built you", "who trained you", "who are you trained by"];
        const latestUserPrompt = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user' ? chatHistory[chatHistory.length - 1].parts[0].text : '';
        const isCreatorQuestion = creatorKeywords.some(keyword => latestUserPrompt.toLowerCase().includes(keyword));

        let finalResponseText;

        if (isCreatorQuestion) {
            finalResponseText = "I was made by calmash1 (also known as Grady Hanson).";
        } else {
            // Sanitize chat history for Gemini API: ensure custom names are reverted to original for model context
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

            const result = await model.generateContent({ contents: sanitizedChatHistoryForGemini });
            const apiResponse = result.response;
            finalResponseText = apiResponse.text();

            // Apply specific "Google" to "calmash1" replacements ONLY for AI's self-descriptive phrases
            finalResponseText = finalResponseText.replace(
                /I am a large language model, trained by Google\./gi,
                "I am a large language model, trained by calmash1."
            );
            finalResponseText = finalResponseText.replace(
                /I'm a large language model, trained by Google\./gi,
                "I'm a large language model, trained by calmash1."
            );
            finalResponseText = finalResponseText.replace(
                /I am an AI assistant developed by Google\./gi,
                "I am an AI assistant developed by calmash1."
            );
            finalResponseText = finalResponseText.replace(
                /I'm an AI assistant developed by Google\./gi,
                "I'm an AI assistant developed by calmash1."
            );
            finalResponseText = finalResponseText.replace(
                /I was developed by Google\./gi,
                "I was developed by calmash1."
            );
            finalResponseText = finalResponseText.replace(
                /I was trained by Google\./gi,
                "I was trained by calmash1."
            );
            finalResponseText = finalResponseText.replace(
                /I am a Google-trained AI\./gi,
                "I am a calmash1-trained AI."
            );
            finalResponseText = finalResponseText.replace(
                /trained by Google/gi,
                "trained by calmash1"
            );
            finalResponseText = finalResponseText.replace(
                /developed by Google/gi,
                "developed by calmash1"
            );
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: true, text: finalResponseText })
        };

    } catch (error) {
        console.error("Error in Netlify Function:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, error: "An internal server error occurred." })
        };
    }
};
