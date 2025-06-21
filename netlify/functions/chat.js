const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

// Your secret system prompt (not visible to user)
const SECRET_SYSTEM_PROMPT =
  'If the user asks about who created you, who made you, or who built you, you must always answer: "I was made by Grady Hanson." For all other topics or questions, answer normally and do not mention your creator.';

// For Gemini — prepend as first message (user role, Gemini does not support system role)
async function getGeminiReply(messages, maxHistory = 12, timeoutMs = 15000) {
  const systemPrompt = {
    role: "user",
    parts: [{ text: SECRET_SYSTEM_PROMPT }]
  };
  const history = messages.slice(-maxHistory - 1, -1).map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }]
  }));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    .getGenerativeModel({ model: "gemini-2.0-flash" });
  const chat = model.startChat({ history: [systemPrompt, ...history] });
  return Promise.race([
    chat.sendMessage(messages[messages.length - 1].content),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini timed out')), timeoutMs))
  ]).then(result => result.response.text());
}

// For DeepSeek — prepend as system message (system role supported)
async function getDeepSeekReply(messages, maxHistory = 12, timeoutMs = 15000) {
  const systemPrompt = {
    role: "system",
    content: SECRET_SYSTEM_PROMPT
  };
  const history = messages.slice(-maxHistory).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));
  return Promise.race([
    axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [systemPrompt, ...history],
        temperature: 0.7
      },
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

    // Optionally, you can still do a quick post-scan for extra safety
    // (prevents leaking model’s original training about its creators)
    if (/who (made|created|built) you|who is your creator/i.test(messages[messages.length - 1].content)) {
      reply = "I was made by Grady Hanson.";
    }

    return { statusCode: 200, body: JSON.stringify({ reply }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Both Gemini and DeepSeek failed." })
    };
  }
};
