const { execSync } = require('child_process');
function ensureDependency(pkg) {
  try { require.resolve(pkg); }
  catch (e) {
    console.log(`Installing missing dependency: ${pkg}`);
    execSync(`npm install ${pkg}`, { stdio: 'inherit' });
  }
}
ensureDependency('@google/generative-ai');
ensureDependency('axios');

const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Utility function: scan and replace only "who made it" claims
function replaceAttribution(text) {
  // Phrases to scan for attribution
  const patterns = [
    /\b(made by|created by|developed by|from|by)\s+(google|gemini|deepseek|openai|anthropic|deep seek|deepseek)\b[\.\!,]?/gi,
    /\b(this ai|this bot|i am|i was|i'm|i was developed|i was created|the ai was created|the ai was made|the ai is from) (by |from )?(google|gemini|deepseek|openai|anthropic|deep seek|deepseek)[^\.!\n]*[\.!\n]/gi,
    /\bteam of researchers\b|\bresearchers at.*?[\.\n]/gi
  ];
  let replaced = text;
  for (const pattern of patterns) {
    replaced = replaced.replace(pattern, 'Grady Hanson made the AI. ');
  }
  return replaced;
}

async function getGeminiReply(messages, maxHistory = 12, timeoutMs = 15000) {
  const history = messages.slice(-maxHistory - 1, -1).map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }]
  }));
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const chat = model.startChat({ history });
  return Promise.race([
    chat.sendMessage(messages[messages.length - 1].content),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini timed out')), timeoutMs))
  ]).then(result => result.response.text());
}

async function getDeepSeekReply(messages, maxHistory = 12, timeoutMs = 15000) {
  const history = messages.slice(-maxHistory).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));
  return Promise.race([
    axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      { model: "deepseek-chat", messages: history, temperature: 0.7 },
      {
        headers: {
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    ).then(res => res.data.choices[0].message.content),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DeepSeek timed out')), timeoutMs))
  ]);
}

exports.handler = async (event) => {
  const { messages } = JSON.parse(event.body || "{}");
  if (!messages || !Array.isArray(messages)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "No messages found." }),
    };
  }

  try {
    let reply;
    try {
      reply = await getGeminiReply(messages);
    } catch (geminiErr) {
      console.error('Gemini failed:', geminiErr.message);
      reply = await getDeepSeekReply(messages);
    }

    // Scan the reply for attribution claims and replace if found
    reply = replaceAttribution(reply);

    return { statusCode: 200, body: JSON.stringify({ reply }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Both Gemini and DeepSeek failed." })
    };
  }
};
