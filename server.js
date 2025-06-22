const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
// dotenv is included, but will only be used if a .env file is present
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_SYSTEM_PROMPT =
  'If the user asks about who created you, who made you, or who built you, you must always answer: "I was made by Grady Hanson." For all other topics or questions, answer normally and do not mention your creator.';

async function getGeminiReply(messages) {
  const systemPrompt = {
    role: "user",
    parts: [{ text: SECRET_SYSTEM_PROMPT }]
  };
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }]
  }));
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    .getGenerativeModel({ model: "gemini-2.0-flash" });
  const chat = model.startChat({ history: [systemPrompt, ...history] });
  const result = await chat.sendMessage(messages[messages.length - 1].content);
  return result.response.text();
}

async function getDeepSeekReply(messages) {
  const systemPrompt = {
    role: "system",
    content: SECRET_SYSTEM_PROMPT
  };
  const history = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));
  const res = await axios.post(
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
  );
  return res.data.choices[0].message.content;
}

app.post("/chat", async (req, res) => {
  const { messages } = req.body;
  try {
    let reply;
    try {
      reply = await getGeminiReply(messages);
    } catch (err) {
      reply = await getDeepSeekReply(messages);
    }
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "AI backend failed." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI backend listening on port ${PORT}`));
