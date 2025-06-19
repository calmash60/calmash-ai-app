// Util: generate simple unique IDs
function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const STORAGE_KEY = "calmash_ai_chats";
let chats = [];
let currentChatId = null;

// DOM refs
const chatListEl = document.getElementById("chat-list");
const chatBoxEl = document.getElementById("chat-box");
const promptInput = document.getElementById("prompt");
const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");

// Create new chat with starting AI message
function createNewChat() {
  return {
    id: genId(),
    name: "New Chat",
    messages: [
      {
        role: "ai",
        content: "Hello! I'm Calmash AI. Ask me anything or ask me to write code."
      }
    ]
  };
}

// Load chats from localStorage
function loadChats() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      chats = JSON.parse(saved);
    } catch {
      chats = [];
    }
  } else {
    chats = [];
  }
  if (chats.length === 0) {
    chats.push(createNewChat());
  }
  currentChatId = chats[0].id;
  saveChats();
  renderChatList();
  renderCurrentChat();
}

// Save chats to localStorage
function saveChats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

// Render chat list sidebar
function renderChatList() {
  chatListEl.innerHTML = "";
  chats.forEach(chat => {
    const item = document.createElement("div");
    item.className = "chat-item" + (chat.id === currentChatId ? " active" : "");
    item.dataset.id = chat.id;

    const name = document.createElement("div");
    name.className = "chat-name";
    name.textContent = chat.name;
    name.contentEditable = false;

    const actions = document.createElement("div");
    actions.className = "chat-actions";

    // Rename button
    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✏️";
    renameBtn.title = "Rename chat";
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      if (name.contentEditable === "true") {
        // Save rename
        name.contentEditable = "false";
        const trimmed = name.textContent.trim();
        if (trimmed.length === 0) {
          name.textContent = chat.name;
        } else {
          chat.name = trimmed;
          saveChats();
          renderChatList();
        }
      } else {
        // Start rename
        name.contentEditable = "true";
        name.focus();
        document.execCommand('selectAll', false, null);
      }
    };

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑";
    delBtn.title = "Delete chat";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    };

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);

    item.appendChild(name);
    item.appendChild(actions);

    item.onclick = () => {
      if (chat.id !== currentChatId) {
        currentChatId = chat.id;
        renderChatList();
        renderCurrentChat();
      }
    };

    chatListEl.appendChild(item);
  });
}

// Delete chat by ID
function deleteChat(id) {
  if (confirm("Delete this chat? This cannot be undone.")) {
    chats = chats.filter(c => c.id !== id);
    if (chats.length === 0) {
      // Always keep at least one chat
      const newChat = createNewChat();
      chats.push(newChat);
      currentChatId = newChat.id;
    } else if (currentChatId === id) {
      currentChatId = chats[0].id;
    }
    saveChats();
    renderChatList();
    renderCurrentChat();
  }
}

// Render current chat messages
function renderCurrentChat() {
  chatBoxEl.innerHTML = "";
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;

  chat.messages.forEach(m => {
    if (m.role === "ai") {
      // Look for code blocks
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/;
      const match = m.content.match(codeBlockRegex);

      if (match) {
        // Show explanation before code block if any
        const beforeCode = m.content.split("```")[0].trim();
        if (beforeCode) {
          const expl = document.createElement("div");
          expl.className = "message ai";
          expl.textContent = beforeCode;
          chatBoxEl.appendChild(expl);
        }
        const lang = match[1] || "txt";
        const code = match[2];
        chatBoxEl.appendChild(createCodeUI(code, lang));
        return;
      }
    }

    // Normal message
    const msgEl = document.createElement("div");
    msgEl.className = "message " + (m.role === "user" ? "user" : "ai");
    msgEl.textContent = m.content;
    chatBoxEl.appendChild(msgEl);
  });

  chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
}

// Create code UI with copy, download, preview buttons
function createCodeUI(code, ext = "txt") {
  const container = document.createElement("div");
  container.className = "code-block";

  const pre = document.createElement("pre");
  pre.textContent = code;
  container.appendChild(pre);

  const buttons = document.createElement("div");
  buttons.className = "buttons";

  // Copy
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.className = "copy";
  copyBtn.onclick = () => navigator.clipboard.writeText(code);
  buttons.appendChild(copyBtn);

  // Download
  const downloadBtn = document.createElement("button");
  downloadBtn.textContent = "Download";
  downloadBtn.className = "download";
  downloadBtn.onclick = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `code.${ext}`;
    link.click();
  };
  buttons.appendChild(downloadBtn);

  // Preview
  const previewBtn = document.createElement("button");
  previewBtn.textContent = "Preview";
  previewBtn.className = "preview";
  previewBtn.onclick = () => {
    const win = window.open();
    if (ext === "html" || ext === "htm") {
      win.document.write(code);
    } else {
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

// Send message to backend and update UI
async function sendMessage(text) {
  if (!text.trim()) return;

  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;

  // Add user message
  chat.messages.push({ role: "user", content: text });
  saveChats();
  renderCurrentChat();
  promptInput.value = "";
  chatBoxEl.scrollTop = chatBoxEl.scrollHeight;

  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text }),
    });
    const data = await res.json();
    chat.messages.push({ role: "ai", content: data.reply });
    saveChats();
    renderCurrentChat();
  } catch {
    chat.messages.push({ role: "ai", content: "Error reaching server." });
    saveChats();
    renderCurrentChat();
  }
}

// Event listeners
sendBtn.addEventListener("click", () => {
  sendMessage(promptInput.value);
});
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(promptInput.value);
  }
});
newChatBtn.addEventListener("click", () => {
  const newChat = createNewChat();
  chats.unshift(newChat);
  currentChatId = newChat.id;
  saveChats();
  renderChatList();
  renderCurrentChat();
});

// Initialize
loadChats();
