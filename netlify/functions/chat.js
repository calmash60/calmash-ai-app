async function askGemini() {
  const input = document.getElementById('prompt');
  const chatBox = document.getElementById('chat-box');
  const prompt = input.value.trim();
  if (!prompt) return;

  const userMsg = document.createElement('div');
  userMsg.className = 'message user';
  userMsg.textContent = prompt;
  chatBox.appendChild(userMsg);

  input.value = '';
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data.reply || 'No response';

    const aiMsg = document.createElement('div');
    aiMsg.className = 'message ai';
    aiMsg.textContent = reply;
    chatBox.appendChild(aiMsg);
    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) {
    const errorMsg = document.createElement('div');
    errorMsg.className = 'message ai';
    errorMsg.textContent = 'Error connecting to server.';
    chatBox.appendChild(errorMsg);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}
