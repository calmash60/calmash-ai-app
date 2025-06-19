function createCodeUI(code, ext = "txt") {
  const container = document.createElement('div');
  container.className = "code-block";

  const pre = document.createElement('pre');
  pre.textContent = code;
  container.appendChild(pre);

  const buttons = document.createElement('div');
  buttons.className = 'buttons';

  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.textContent = "Copy";
  copyBtn.className = 'copy';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(code);
  };
  buttons.appendChild(copyBtn);

  // Download button
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = "Download";
  downloadBtn.className = 'download';
  downloadBtn.onclick = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `code.${ext}`;
    link.click();
  };
  buttons.appendChild(downloadBtn);

  // Preview button
  const previewBtn = document.createElement('button');
  previewBtn.textContent = "Preview";
  previewBtn.className = 'preview';
  previewBtn.onclick = () => {
    const win = window.open();
    if (ext === "html" || ext === "htm") {
      // Render HTML directly
      win.document.write(code);
    } else {
      // For other file types, show raw code in a pre tag
      win.document.body.style.whiteSpace = "pre-wrap";
      win.document.body.style.fontFamily = "monospace";
      win.document.body.textContent = code;
    }
    win.document.close();
  };
  buttons.appendChild(previewBtn);

  container.appendChild(buttons);
  return container;
}

async function askGemini() {
  const input = document.getElementById('prompt');
  const chatBox = document.getElementById('chat-box');
  const prompt = input.value.trim();
  if (!prompt) return;

  // Show user message
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

    const aiMsg = document.createElement('div');
    aiMsg.className = 'message ai';

    // Match code block: ```lang\ncode\n```
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/;
    const match = data.reply.match(codeBlockRegex);

    if (match) {
      // Show any explanation text before code block
      const beforeCode = data.reply.split("```")[0];
      if (beforeCode.trim()) {
        const expl = document.createElement('div');
        expl.className = 'message ai';
        expl.textContent = beforeCode.trim();
        chatBox.appendChild(expl);
      }

      // Show code block with buttons
      const lang = match[1] || "txt";
      const code = match[2];
      chatBox.appendChild(createCodeUI(code, lang));
    } else {
      // No code block, just plain text
      aiMsg.textContent = data.reply;
      chatBox.appendChild(aiMsg);
    }

    chatBox.scrollTop = chatBox.scrollHeight;
  } catch {
    const err = document.createElement('div');
    err.className = 'message ai';
    err.textContent = 'Error reaching server.';
    chatBox.appendChild(err);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}
