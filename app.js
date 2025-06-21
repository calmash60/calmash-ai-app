// --------- Utilities ------------
function isLocalStorageAvailable() {
  try {
    const test = '__localStorageTest__';
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}
function debounce(fn, t) {
  let id = null;
  return function(...a) {
    clearTimeout(id);
    id = setTimeout(() => fn.apply(this, a), t);
  }
}

// --------- Theme & DOM ----------
const darkToggle = document.getElementById('dark-toggle');
darkToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  if (isLocalStorageAvailable()) {
    localStorage.setItem('calmash_dark', document.body.classList.contains('dark-mode'));
  }
});
if (isLocalStorageAvailable() && localStorage.getItem('calmash_dark') === 'true') {
  document.body.classList.add('dark-mode');
}

const chatBox = document.getElementById("chat-box");
const promptInput = document.getElementById("user-prompt");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("send");
const chatListEl = document.getElementById("chat-list");
const errorBanner = document.getElementById("error-banner");
const loadingIndicator = document.getElementById("loading-indicator");
const exportBtn = document.getElementById("export-history");
const newChatBtn = document.getElementById("new-chat");

let chats = {};
let currentChatId = null;

// --------- Chat State -----------
function loadChats() {
  if (isLocalStorageAvailable()) {
    try {
      chats = JSON.parse(localStorage.getItem("calmash_chats") || "{}");
      currentChatId = localStorage.getItem("calmash_current") || createChat();
    } catch (e) {
      chats = {};
      currentChatId = createChat();
    }
  } else {
    chats = {};
    currentChatId = createChat();
  }
}

function saveChats() {
  if (isLocalStorageAvailable()) {
    localStorage.setItem("calmash_chats", JSON.stringify(chats));
    localStorage.setItem("calmash_current", currentChatId);
  }
  renderChatList();
}

function createChat() {
  const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  chats[id] = { name: "New Chat", messages: [] };
  saveChats();
  return id;
}

function switchChat(id) {
  currentChatId = id;
  saveChats();
  render();
}

function newChat() {
  currentChatId = createChat();
  saveChats();
  render();
}

function renameChat(id) {
  const oldName = chats[id].name;
  let name = window.prompt("Rename chat:", oldName);
  if (name === null) return;
  name = name.trim();
  if (!name) {
    alert("Chat name cannot be empty.");
    return;
  }
  if (name.length > 30) {
    alert("Chat name too long (max 30 characters).");
    return;
  }
  chats[id].name = name;
  saveChats();
}

function deleteChat(id) {
  if (confirm("Delete this chat?")) {
    delete chats[id];
    if (currentChatId === id) {
      currentChatId = Object.keys(chats)[0] || createChat();
    }
    saveChats();
    render();
  }
}

// --------- Chat List Render -----
function renderChatList() {
  chatListEl.innerHTML = "";
  Object.entries(chats).forEach(([id, chat]) => {
    const div = document.createElement("div");
    div.className = "chat-item" + (id === currentChatId ? " active" : "");
    div.setAttribute('tabindex', 0);
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', `Switch to chat: ${chat.name}`);
    // Chat title
    const titleDiv = document.createElement('div');
    titleDiv.textContent = chat.name;
    titleDiv.className = "chat-title";
    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = "chat-actions";
    // Rename
    const renameBtn = document.createElement('button');
    renameBtn.type = "button";
    renameBtn.className = 'edit-btn';
    renameBtn.innerHTML = '<i class="fa fa-pen-to-square"></i>';
    renameBtn.setAttribute('aria-label', 'Rename chat');
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renameChat(id);
    });
    // Delete
    const delBtn = document.createElement('button');
    delBtn.type = "button";
    delBtn.className = 'delete-msg-btn';
    delBtn.innerHTML = '<i class="fa fa-trash"></i>';
    delBtn.setAttribute('aria-label', 'Delete chat');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(id);
    });
    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(delBtn);

    div.appendChild(titleDiv);
    div.appendChild(actionsDiv);

    div.addEventListener('click', () => switchChat(id));
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchChat(id);
      }
    });
    chatListEl.appendChild(div);
  });
}

// --------- Virtual Scroll Render --------
// Only render messages in the viewport for speed
function render() {
  chatBox.innerHTML = "";
  errorBanner.style.display = "none";
  const messages = chats[currentChatId]?.messages || [];
  // Virtual scroll: render only last 50 messages or all if fewer
  const MAX = 50;
  const start = messages.length > MAX ? messages.length - MAX : 0;
  if (messages.length === 0) {
    chatBox.innerHTML = '<div class="placeholder">Start a new chat or select an existing one.</div>';
    return;
  }
  for (let idx = start; idx < messages.length; idx++) {
    const msg = messages[idx];
    const div = document.createElement("div");
    div.className = `message ${msg.role}`;
    // Code block highlighting and code actions
    const codeBlockRegex = /```(\w+)?\n([\s\S]+?)```/g;
    if (codeBlockRegex.test(msg.content)) {
      div.innerHTML = DOMPurify.sanitize(
        msg.content.replace(codeBlockRegex, (_, lang, code) => {
          const ext = lang ? '.' + lang.trim() : '.txt';
          const encoded = encodeURIComponent(code.trim());
          return `
            <pre><code>${DOMPurify.sanitize(code.trim())}</code></pre>
            <div class="code-actions">
              <button type="button" data-action="copy" data-code="${encoded}" aria-label="Copy code"><i class="fa fa-copy"></i> Copy</button>
              <button type="button" data-action="download" data-code="${encoded}" data-ext="${ext}" aria-label="Download code"><i class="fa fa-download"></i> Download</button>
              <button type="button" data-action="preview" data-code="${encoded}" data-lang="${lang || 'html'}" aria-label="Preview code"><i class="fa fa-eye"></i> Preview</button>
            </div>`;
        })
      );
    } else {
      div.textContent = msg.content;
    }
    if (msg.role === 'user') {
      const editBtn = document.createElement('button');
      editBtn.type = "button";
      editBtn.innerHTML = '<i class="fa fa-pen"></i> Edit';
      editBtn.className = 'edit-btn';
      editBtn.setAttribute('aria-label', 'Edit message');
      editBtn.addEventListener('click', () => editMessage(idx));
      div.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.type = "button";
      delBtn.innerHTML = '<i class="fa fa-trash"></i> Delete';
      delBtn.className = 'delete-msg-btn';
      delBtn.setAttribute('aria-label', 'Delete message');
      delBtn.addEventListener('click', () => deleteMessage(idx));
      div.appendChild(delBtn);
    }
    chatBox.appendChild(div);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}

function editMessage(idx) {
  const chat = chats[currentChatId];
  const oldMsg = chat.messages[idx].content;
  const newMsg = prompt('Edit your message:', oldMsg);
  if (newMsg !== null && newMsg.trim().length > 0) {
    chat.messages[idx].content = newMsg.trim();
    saveChats();
    render();
  }
}
function deleteMessage(idx) {
  const chat = chats[currentChatId];
  if (confirm('Delete this message?')) {
    chat.messages.splice(idx, 1);
    saveChats();
    render();
  }
}

// --------- Code Block Actions ---------
chatBox.addEventListener('click', function(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const code = decodeURIComponent(btn.getAttribute('data-code'));
  const action = btn.getAttribute('data-action');
  if (action === 'copy') {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(code)
        .then(() => alert("Copied to clipboard!"))
        .catch(() => fallbackCopyTextToClipboard(code));
    } else {
      fallbackCopyTextToClipboard(code);
    }
  } else if (action === 'download') {
    const ext = btn.getAttribute('data-ext') || '.txt';
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "code" + ext;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
  } else if (action === 'preview') {
    const lang = btn.getAttribute('data-lang');
    previewCode(code, lang);
  }
});
function fallbackCopyTextToClipboard(text) {
  let textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    alert('Copied to clipboard!');
  } catch (err) {
    alert('Failed to copy text');
  }
  document.body.removeChild(textarea);
}
function previewCode(code, lang) {
  const win = window.open("", "_blank", "noopener");
  if (lang === "html") {
    const safe = DOMPurify.sanitize(code);
    win.document.write(`<iframe sandbox="allow-scripts" style="width:100vw;height:100vh;border:0;" srcdoc="${safe.replace(/"/g, '&quot;')}"></iframe>`);
  } else {
    win.document.write("<pre>" + DOMPurify.sanitize(code).replace(/</g, "&lt;") + "</pre>");
  }
}

// --------- Message Send & Server -----
async function sendMessage() {
  errorBanner.style.display = "none";
  const input = promptInput.value.trim();
  if (!input && (!fileInput.files || !fileInput.files.length)) {
    errorBanner.innerText = "Input is empty.";
    errorBanner.style.display = "block";
    return;
  }
  if (fileInput.files && fileInput.files.length) {
    const file = fileInput.files[0];
    if (file.size > 500 * 1024) {
      errorBanner.innerText = "File too large. Max 500KB.";
      errorBanner.style.display = "block";
      return;
    }
    if (!file.type.match(/(text|json|csv|xml|plain)/i)) {
      errorBanner.innerText = "Unsupported file type.";
      errorBanner.style.display = "block";
      return;
    }
  }
  const chat = chats[currentChatId];
  if (input) chat.messages.push({ role: "user", content: input });

  if (fileInput.files && fileInput.files.length) {
    const reader = new FileReader();
    reader.onload = function (e) {
      chat.messages.push({ role: "user", content: e.target.result });
      sendToServer(chat);
    };
    reader.onerror = function () {
      errorBanner.innerText = "Failed to read file.";
      errorBanner.style.display = "block";
    };
    reader.readAsText(fileInput.files[0]);
  } else {
    sendToServer(chat);
  }
  render();
  promptInput.value = "";
  fileInput.value = "";
}

async function sendToServer(chat) {
  loadingIndicator.style.display = 'block';
  // Add a 'pending' message for a better UX
  chat.messages.push({ role: "ai", content: "..." });
  render();
  let didTimeout = false;
  let timeoutId = setTimeout(() => {
    didTimeout = true;
    loadingIndicator.style.display = 'none';
    errorBanner.innerText = "Request timed out.";
    errorBanner.style.display = "block";
    // Remove pending message
    chat.messages = chat.messages.filter(m => m.content !== "...");
    render();
  }, 25000); // 25 seconds
  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat.messages.filter(m => m.content !== "...") })
    });
    clearTimeout(timeoutId);
    if (didTimeout) return;
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error("Invalid server response.");
    }
    // Remove pending
    chat.messages = chat.messages.filter(m => m.content !== "...");
    if (!res.ok) {
      throw new Error(data?.error || "Network error");
    }
    chat.messages.push({ role: "ai", content: data.reply });
    render();
    saveChats();
  } catch (e) {
    chat.messages = chat.messages.filter(m => m.content !== "...");
    chat.messages.push({ role: "ai", content: "Error: " + e.message });
    errorBanner.innerText = "Error: " + e.message;
    errorBanner.style.display = "block";
    render();
  } finally {
    loadingIndicator.style.display = 'none';
  }
}

// --------- Button & Events -------
sendBtn.addEventListener("click", sendMessage);
promptInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});
exportBtn.addEventListener("click", function() {
  const blob = new Blob([JSON.stringify(chats, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "calmash_chat_history.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
});
newChatBtn.addEventListener("click", newChat);

chatListEl.addEventListener('keydown', function(e) {
  const items = Array.from(chatListEl.querySelectorAll('.chat-item'));
  const idx = items.indexOf(document.activeElement);
  if (idx === -1) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = items[idx + 1] || items[0];
    next.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = items[idx - 1] || items[items.length - 1];
    prev.focus();
  }
});

// --------- Init ---------------
loadChats();
renderChatList();
render();
