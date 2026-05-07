/* ── State ── */
let allWords = [],
  queue = [],
  currentWord = null,
  shown = 0,
  round = 1;
let currentAudio = null;

/* ── Settings toggle ── */
function toggleSettings() {
  const p = document.getElementById("settingsPanel");
  p.classList.toggle("open");
}

function onEngineChange() {
  const v = document.getElementById("engineSelect").value;
  document.getElementById("browserOpts").style.display =
    v === "browser" ? "block" : "none";
  document.getElementById("openaiOpts").style.display =
    v === "openai" ? "flex" : "none";
  document.getElementById("elevenOpts").style.display =
    v === "elevenlabs" ? "flex" : "none";
}

/* ── Browser voices ── */
function loadVoices() {
  const sel = document.getElementById("voiceSelect");
  const voices = speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang.startsWith("en"));
  sel.innerHTML = "";
  (en.length ? en : voices).forEach((v) => {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    if (v.default) o.selected = true;
    sel.appendChild(o);
  });
}
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

/* ── Game logic ── */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startGame() {
  const raw = document.getElementById("wordInput").value.trim();
  allWords = raw
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean);
  if (!allWords.length) return;
  round = 1;
  shown = 0;
  queue = shuffle(allWords);
  document.getElementById("setupPanel").style.display = "none";
  document.getElementById("gamePanel").style.display = "flex";
  document.getElementById("doneScreen").style.display = "none";
  document.getElementById("settingsPanel").classList.remove("open");
  updateProgress();
  nextWord();
}

function updateProgress() {
  const total = allWords.length;
  document.getElementById("barFill").style.width = total
    ? (shown / total) * 100 + "%"
    : "0%";
  document.getElementById("countLabel").textContent = shown + " / " + total;
  document.getElementById("roundBadge").textContent = "Round " + round;
}

function nextWord() {
  stopAudio();
  document.getElementById("answerReveal").classList.remove("visible");

  if (!queue.length) {
    shown = 0;
    round++;
    queue = shuffle(allWords);
    updateProgress();
    showDone();
    return;
  }

  currentWord = queue.shift();
  shown++;

  const card = document.getElementById("wordCard");
  card.classList.add("hidden");
  setTimeout(() => {
    const wordText = document.getElementById("wordText");
    const hintLabel = document.getElementById("hintLabel");
    wordText.textContent = currentWord;
    const len = currentWord.length;
    wordText.style.fontSize =
      len <= 6 ? "" : len <= 10 ? "36px" : len <= 14 ? "26px" : "20px";
    wordText.classList.add("concealed");
    hintLabel.classList.remove("hidden");
    card.classList.remove("hidden");
    updateProgress();
    speak(currentWord);
  }, 200);
}

function showAnswer() {
  if (!currentWord) return;
  const wordText = document.getElementById("wordText");
  const hintLabel = document.getElementById("hintLabel");
  wordText.classList.remove("concealed");
  hintLabel.classList.add("hidden");
}

function showDone() {
  document.getElementById("gamePanel").style.display = "none";
  document.getElementById("doneScreen").style.display = "flex";
  document.getElementById("doneSub").textContent =
    allWords.length + " words · Round " + (round - 1) + " complete";
  speak("All done!");
}

function resetGame() {
  stopAudio();
  document.getElementById("doneScreen").style.display = "none";
  document.getElementById("gamePanel").style.display = "none";
  document.getElementById("setupPanel").style.display = "flex";
}

/* ── TTS dispatcher ── */
function speak(text) {
  stopAudio();
  const engine = document.getElementById("engineSelect").value;
  if (engine === "openai") {
    speakOpenAI(text);
  } else if (engine === "elevenlabs") {
    speakElevenLabs(text);
  } else {
    speakBrowser(text);
  }
}

function setSpeaking(on) {
  document.getElementById("speakDot").classList.toggle("active", on);
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  setSpeaking(false);
}

/* ── Browser TTS ── */
function speakBrowser(text) {
  if (!window.speechSynthesis) return;
  const utt = new SpeechSynthesisUtterance(text);
  const voiceName = document.getElementById("voiceSelect").value;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.name === voiceName);
  if (voice) utt.voice = voice;
  utt.lang = voice ? voice.lang : "en-US";
  utt.rate = parseFloat(document.getElementById("rateRange").value);
  utt.onstart = () => setSpeaking(true);
  utt.onend = () => setSpeaking(false);
  utt.onerror = () => setSpeaking(false);
  speechSynthesis.speak(utt);
}

/* ── OpenAI TTS ── */
async function speakOpenAI(text) {
  const key = document.getElementById("openaiKey").value.trim();
  if (!key) {
    showError("OpenAI API key is required");
    return;
  }
  const model = document.getElementById("openaiModel").value;
  const voice = document.getElementById("openaiVoice").value;
  setSpeaking(true);
  try {
    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: "mp3",
      }),
    });
    if (!resp.ok) {
      const e = await resp.json();
      throw new Error(e.error?.message || resp.status);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => {
      setSpeaking(false);
      URL.revokeObjectURL(url);
    };
    currentAudio.onerror = () => setSpeaking(false);
    currentAudio.play();
  } catch (e) {
    setSpeaking(false);
    showError("OpenAI TTS: " + e.message);
  }
}

/* ── ElevenLabs TTS ── */
async function speakElevenLabs(text) {
  const key = document.getElementById("elevenKey").value.trim();
  const voiceId = document.getElementById("elevenVoiceId").value.trim();
  if (!key) {
    showError("ElevenLabs API key is required");
    return;
  }
  if (!voiceId) {
    showError("ElevenLabs voice ID is required");
    return;
  }
  setSpeaking(true);
  try {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );
    if (!resp.ok) {
      const e = await resp.json();
      throw new Error(e.detail?.message || resp.status);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => {
      setSpeaking(false);
      URL.revokeObjectURL(url);
    };
    currentAudio.onerror = () => setSpeaking(false);
    currentAudio.play();
  } catch (e) {
    setSpeaking(false);
    showError("ElevenLabs: " + e.message);
  }
}

/* ── Error toast ── */
let toastTimer;
function showError(msg) {
  const el = document.getElementById("errorToast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
