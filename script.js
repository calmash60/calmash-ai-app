async function askGemini() {
  const prompt = document.getElementById('prompt').value;
  const responseEl = document.getElementById('response');

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  responseEl.textContent = data.reply || 'No response';
}
