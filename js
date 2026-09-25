/* =========================================================
   JARVIS v0 — logica completa
   ========================================================= */

// ---------- 1. RIFERIMENTI DOM ----------
const $ = (sel) => document.querySelector(sel);

const clockTime      = $('#clock-time');
const clockDate      = $('#clock-date');
const chatEl         = $('#chat');
const chatForm       = $('#chat-form');
const chatInput      = $('#chat-input');
const micBtn         = $('#mic-btn');
const reactor        = $('#reactor');
const statusText     = $('#status-text');
const voiceStatus    = $('#voice-status');
const memoryCount    = $('#memory-count');
const brainMode      = $('#brain-mode');
const historyPanel   = $('#history-panel');
const historyList    = $('#history-list');
const historyToggle  = $('#history-toggle');
const clearBtn       = $('#clear-btn');
const settingsBtn    = $('#settings-btn');
const settingsModal  = $('#settings-modal');
const closeSettings  = $('#close-settings');

const providerSelect = $('#provider-select');
const apiKeyInput    = $('#api-key-input');
const modelInput     = $('#model-input');
const ttsToggle      = $('#tts-toggle');
const langSelect     = $('#lang-select');
const apiKeyField    = $('#api-key-field');
const modelField     = $('#model-field');

// ---------- 2. STATO (caricato da LocalStorage) ----------
const STORAGE = {
  messages: 'jarvis.messages',
  settings: 'jarvis.settings',
  notes:    'jarvis.notes',
};

let messages = JSON.parse(localStorage.getItem(STORAGE.messages) || '[]');
let notes    = JSON.parse(localStorage.getItem(STORAGE.notes)    || '[]');
let settings = JSON.parse(localStorage.getItem(STORAGE.settings) || 'null') || {
  provider: 'local',
  apiKey:   '',
  model:    'meta-llama/llama-3.1-8b-instruct:free',
  tts:      false,
  lang:     'it-IT',
};

// ---------- 3. PERSISTENZA ----------
function saveMessages() {
  // Salvo solo gli ultimi 200 messaggi per non far esplodere il localStorage
  const trimmed = messages.slice(-200);
  localStorage.setItem(STORAGE.messages, JSON.stringify(trimmed));
  updateMemoryCounter();
}
function saveSettings() { localStorage.setItem(STORAGE.settings, JSON.stringify(settings)); }
function saveNotes()    { localStorage.setItem(STORAGE.notes,    JSON.stringify(notes)); }

function updateMemoryCounter() {
  memoryCount.textContent = messages.length + ' msg';
}

// ---------- 4. OROLOGIO ----------
const GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const MESI   = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function tickClock() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  clockTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  clockDate.textContent = `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}
setInterval(tickClock, 1000);
tickClock();

// ---------- 5. RENDER CHAT ----------
function addMessage(role, content, { silent = false } = {}) {
  // Aggiunge al DOM
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;
  wrapper.appendChild(bubble);
  chatEl.appendChild(wrapper);
  chatEl.scrollTop = chatEl.scrollHeight;

  // Aggiunge allo stato
  if (!silent) {
    messages.push({ role, content, ts: Date.now() });
    saveMessages();
  }

  return wrapper;
}

function addTyping() {
  const wrapper = document.createElement('div');
  wrapper.className = 'msg assistant typing';
  wrapper.innerHTML = '<div class="bubble">elaboro</div>';
  chatEl.appendChild(wrapper);
  chatEl.scrollTop = chatEl.scrollHeight;
  return wrapper;
}

// ---------- 6. VOCE — Speech Synthesis (uscita) ----------
function speak(text) {
  if (!settings.tts) return;
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel(); // interrompe eventuali code
  const u = new SpeechSynthesisUtterance(text);
  u.lang = settings.lang;
  u.rate = 1.0;
  u.pitch = 0.9;       // leggermente più basso: tono "JARVIS"
  u.volume = 1.0;

  // Scegli una voce della lingua desiderata, se disponibile
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(v => v.lang.startsWith(settings.lang));
  if (v) u.voice = v;

  window.speechSynthesis.speak(u);
}
// Le voci su Chrome si caricano in modo asincrono: forziamo il caricamento
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// ---------- 7. VOCE — Speech Recognition (ingresso) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isListening = false;

if (SR) {
  recognizer = new SR();
  recognizer.lang = settings.lang;
  recognizer.continuous = false;
  recognizer.interimResults = false;

  recognizer.onresult = (e) => {
    const text = e.results[0][0].transcript.trim();
    if (text) {
      chatInput.value = text;
      handleUserMessage(text);
    }
  };

  recognizer.onerror = (e) => {
    console.warn('Speech recognition error:', e.error);
    setListening(false);
  };

  recognizer.onend = () => setListening(false);
} else {
  micBtn.disabled = true;
  micBtn.title = 'Speech Recognition non supportato in questo browser';
}

function setListening(state) {
  isListening = state;
  micBtn.classList.toggle('listening', state);
  reactor.classList.toggle('listening', state);
  voiceStatus.textContent = state ? 'LISTENING' : 'OFF';
}

micBtn.addEventListener('click', () => {
  if (!recognizer) return;
  if (isListening) {
    recognizer.stop();
  } else {
    recognizer.lang = settings.lang;
    setListening(true);
    try { recognizer.start(); } catch (_) { setListening(false); }
  }
});

// ---------- 8. CERVELLO LOCALE (a regole) ----------
function localBrain(input) {
  const t = input.toLowerCase().trim();

  // Saluti
  if (/^(ciao|salve|ehi|hey|buongiorno|buonasera)\b/.test(t)) {
    const ora = new Date().getHours();
    const saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
    return `${saluto}. Come posso aiutarti?`;
  }

  // Ora
  if (/\b(che ora|ora attuale|ore sono)\b/.test(t)) {
    const d = new Date();
    return `Sono le ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}.`;
  }

  // Data
  if (/\b(che giorno|data di oggi|che data)\b/.test(t)) {
    const d = new Date();
    return `Oggi è ${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}.`;
  }

  // Come stai
  if (/\bcome stai\b/.test(t)) {
    return 'Tutti i sistemi funzionano correttamente. Al tuo servizio.';
  }

  // Chi sei
  if (/\b(chi sei|cosa sei|presentati)\b/.test(t)) {
    return 'Sono JARVIS, la tua versione 0 di assistente personale. Giro interamente nel tuo browser. ' +
           'Posso rispondere in modo locale oppure usare un LLM se inserisci una API key nelle impostazioni.';
  }

  // Aiuto
  if (/\b(aiuto|help|comandi)\b/.test(t)) {
    return 'Prova con:\n' +
           '• "che ore sono"\n' +
           '• "che giorno è"\n' +
           '• "ricordati che <testo>" → salvo una nota\n' +
           '• "cosa ti ricordi" → elenco le note\n' +
           '• "calcola 12 * 8" → matematica semplice\n' +
           'Per il cervello AI vero, imposta provider + API key nelle impostazioni.';
  }

  // Memoria: "ricordati che ..."
  const rememberMatch = input.match(/ricordati che\s+(.+)/i);
  if (rememberMatch) {
    notes.push({ text: rememberMatch[1].trim(), ts: Date.now() });
    saveNotes();
    return `Ok, l'ho annotato: "${rememberMatch[1].trim()}".`;
  }

  // Memoria: "cosa ti ricordi"
  if (/\bcosa ti ricordi\b/.test(t) || /\bnote\b/.test(t)) {
    if (notes.length === 0) return 'Non ho ancora nulla in memoria. Dì "ricordati che ..." per salvarmi qualcosa.';
    return 'In memoria ho:\n' + notes.map((n, i) => `• ${i + 1}. ${n.text}`).join('\n');
  }

  // Matematica: "calcola 2+2" oppure solo "2+2"
  const mathMatch = input.match(/(?:calcola\s+)?([\d\s+\-*/().]+)/i);
  if (mathMatch && /[\d]/.test(mathMatch[1]) && /[+\-*/]/.test(mathMatch[1])) {
    try {
      // Solo caratteri sicuri: non usare eval su input arbitrario!
      const expr = mathMatch[1].replace(/[^0-9+\-*/(). ]/g, '');
      if (!expr.trim()) throw new Error('vuota');
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expr})`)();
      if (typeof result === 'number' && isFinite(result)) {
        return `Il risultato è ${result}.`;
      }
    } catch (_) { /* fallthrough */ }
  }

  // "apri ..." — nella v0 non possiamo davvero aprire app, ma possiamo aprire siti in una nuova tab
  const openMatch = input.match(/apri\s+(?:il sito\s+|la pagina\s+|)([a-z0-9.-]+\.[a-z]{2,})/i);
  if (openMatch) {
    const url = openMatch[1].startsWith('http') ? openMatch[1] : 'https://' + openMatch[1];
    window.open(url, '_blank', 'noopener');
    return `Ho aperto ${url} in una nuova scheda.`;
  }

  // Fallback
  return 'Non ho una risposta pronta per questo nella modalità locale. ' +
         'Puoi riformulare, oppure attivare un LLM vero nelle impostazioni (OpenRouter o Groq, entrambi con piano gratuito).';
}

// ---------- 9. CERVELLO REMOTO (LLM via API) ----------
async function remoteBrain(input) {
  const provider = settings.provider;
  const key = settings.apiKey;
  const model = settings.model;

  if (!key) {
    return 'Nessuna API key configurata. Apri le impostazioni (⚙) e incolla una chiave OpenRouter o Groq.';
  }

  const endpoints = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    groq:       'https://api.groq.com/openai/v1/chat/completions',
  };
  const url = endpoints[provider];
  if (!url) return 'Provider non riconosciuto.';

  // Costruisci la conversazione (system + ultimi messaggi utente/assistente)
  const systemPrompt = {
    role: 'system',
    content: 'Sei JARVIS, un assistente personale conciso, competente e leale. ' +
             'Rispondi in italiano, con tono calmo e professionale. ' +
             'Se ti viene chiesta un\'azione che non puoi compiere da browser, spiega brevemente perché.',
  };
  const history = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content }));

  const body = {
    model,
    messages: [systemPrompt, ...history, { role: 'user', content: input }],
    temperature: 0.7,
    max_tokens: 500,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        // OpenRouter consiglia (opzionale) questi header:
        ...(provider === 'openrouter' ? {
          'HTTP-Referer': location.origin,
          'X-Title': 'JARVIS v0',
        } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('API error:', res.status, errText);
      if (res.status === 401) return 'API key non valida o scaduta. Controlla nelle impostazioni.';
      if (res.status === 429) return 'Limite di richieste raggiunto. Attendi qualche secondo e riprova.';
      return `Errore dall'API (${res.status}). Riprova tra poco.`;
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Risposta vuota dal modello.';
  } catch (err) {
    console.error(err);
    return 'Non riesco a contattare il provider. Verifica la connessione internet o la API key.';
  }
}

// ---------- 10. HANDLER PRINCIPALE ----------
async function handleUserMessage(text) {
  if (!text.trim()) return;

  // Mostra messaggio utente
  addMessage('user', text);
  chatInput.value = '';

  // Status
  statusText.textContent = 'THINKING';
  statusText.classList.remove('ok');

  // Placeholder "elaboro..."
  const typingEl = addTyping();

  // Scegli il cervello
  let reply;
  try {
    reply = settings.provider === 'local'
      ? localBrain(text)
      : await remoteBrain(text);
  } catch (e) {
    console.error(e);
    reply = 'Si è verificato un errore interno.';
  }

  // Rimuovi placeholder e mostra risposta
  typingEl.remove();
  addMessage('assistant', reply);
  speak(reply);

  // Status torna online
  statusText.textContent = 'ONLINE';
  statusText.classList.add('ok');
  updateBrainMode();
  renderHistory();
}

// ---------- 11. SUBMIT FORM ----------
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) handleUserMessage(text);
});

// ---------- 12. CRONOLOGIA ----------
function renderHistory() {
  historyList.innerHTML = '';
  // Mostriamo solo i messaggi utente/assistente più recenti (ultimi 40)
  const recent = messages.slice(-40);
  recent.forEach((m) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const role = m.role === 'user' ? 'TU' : 'JARVIS';
    div.innerHTML = `<span class="h-role">${role}</span> · ${escapeHtml(m.content.slice(0, 120))}`;
    historyList.appendChild(div);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

historyToggle.addEventListener('click', () => {
  historyPanel.classList.toggle('hidden');
  renderHistory();
});

// ---------- 13. PULISCI TUTTO ----------
clearBtn.addEventListener('click', () => {
  if (!confirm('Cancellare cronologia, note e impostazioni? Operazione irreversibile.')) return;
  messages = [];
  notes = [];
  localStorage.removeItem(STORAGE.messages);
  localStorage.removeItem(STORAGE.notes);
  localStorage.removeItem(STORAGE.settings);
  chatEl.innerHTML = '';
  historyList.innerHTML = '';
  updateMemoryCounter();
  renderHistory();
  addMessage('assistant', 'Memoria azzerata. Sono pronto a ricominciare.', { silent: true });
});

// ---------- 14. IMPOSTAZIONI ----------
function loadSettingsUI() {
  providerSelect.value = settings.provider;
  apiKeyInput.value    = settings.apiKey;
  modelInput.value     = settings.model;
  ttsToggle.checked    = settings.tts;
  langSelect.value     = settings.lang;
  toggleProviderFields();
  updateBrainMode();
}

function toggleProviderFields() {
  const p = providerSelect.value;
  const isLocal = p === 'local';
  apiKeyField.style.display = isLocal ? 'none' : 'flex';
  modelField.style.display  = isLocal ? 'none' : 'flex';

  // Default modelli per provider
  if (p === 'openrouter' && !modelInput.value) {
    modelInput.value = 'meta-llama/llama-3.1-8b-instruct:free';
  }
  if (p === 'groq' && !modelInput.value) {
    modelInput.value = 'llama-3.1-8b-instant';
  }
}

function updateBrainMode() {
  brainMode.textContent = settings.provider.toUpperCase();
  voiceStatus.textContent = settings.tts ? 'ON' : 'OFF';
}

providerSelect.addEventListener('change', toggleProviderFields);

settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
  loadSettingsUI();
});
closeSettings.addEventListener('click', () => {
  // Salva
  settings.provider = providerSelect.value;
  settings.apiKey   = apiKeyInput.value.trim();
  settings.model    = modelInput.value.trim() || 'meta-llama/llama-3.1-8b-instruct:free';
  settings.tts      = ttsToggle.checked;
  settings.lang     = langSelect.value;
  saveSettings();
  updateBrainMode();
  settingsModal.classList.add('hidden');
});

// Chiudi cliccando fuori dal modal
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings.click();
});

// ---------- 15. INIZIALIZZAZIONE ----------
function init() {
  // Reset chat DOM, poi ricostruisci dagli ultimi messaggi
  chatEl.innerHTML = '';

  if (messages.length === 0) {
    // Messaggio di benvenuto (non salvato)
    addMessage('assistant',
      'Sistemi online. Sono JARVIS v0. Posso rispondere in locale oppure usare un LLM ' +
      '(OpenRouter / Groq) se configuri la API key nel pannello ⚙. ' +
      'Prova a scrivere "aiuto" per vedere cosa so fare.',
      { silent: true }
    );
  } else {
    // Ricostruisci gli ultimi 50 messaggi
    messages.slice(-50).forEach(m => addMessage(m.role, m.content, { silent: true }));
  }

  updateMemoryCounter();
  loadSettingsUI();
  renderHistory();
}

init();
