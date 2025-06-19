export async function handler(event, context) {
  const { prompt } = JSON.parse(event.body);
  const apiKey = process.env.GEMINI_API_KEY;

  const question = prompt.toLowerCase();
  const creatorPhrases = ["who made you", "who created you", "your creator", "who built you", "who's your developer"];
  if (creatorPhrases.some(phrase => question.includes(phrase))) {
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: "Grady Hanson made me." })
    };
  }

  const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await geminiRes.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply';

  return {
    statusCode: 200,
    body: JSON.stringify({ reply })
  };
}
