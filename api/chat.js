export default async function handler(req, res) {
  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const question = prompt.toLowerCase();
  const creatorPhrases = ["who made you", "who created you", "your creator", "who built you", "who's your developer"];
  if (creatorPhrases.some(phrase => question.includes(phrase))) {
    return res.status(200).json({ reply: "Grady Hanson made me." });
  }

  const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await geminiRes.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply';

  res.status(200).json({ reply });
}
