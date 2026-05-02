// ==============================
// 設定
// ==============================

const AUTO_NEXT_MS = 4500;
const SPEAK_LANG = "en-US";
const TIMER_START = 5;
const TIMER_STEP_MS = 1000;


// ==============================
// HTML要素の取得
// ==============================

const progressEl = document.getElementById("progress");
const timerBarEl = document.getElementById("timerBar");
const wordEl = document.getElementById("word");
const choice0El = document.getElementById("choice0");
const choice1El = document.getElementById("choice1");
const messageEl = document.getElementById("message");
const messageTextEl = document.getElementById("messageText");
const inlineNextBtnEl = document.getElementById("inlineNextBtn");
const explanationEl = document.getElementById("explanation");
const soundToggleBtnEl = document.getElementById("soundToggleBtn");
const finishNowBtnEl = document.getElementById("finishNowBtn");
const resetNowBtnEl = document.getElementById("resetNowBtn");


// ==============================
// 内部状態
// ==============================

let autoNextTimer = null;
let countdownTimer = null;
let countdownRemaining = TIMER_START;
let soundEnabled = false;


// ==============================
// レベルと保存キー
// ==============================

const currentLevel = new URLSearchParams(window.location.search).get("level") || "1";

const STORAGE_KEY = `etymology_quiz_mastered_level_${currentLevel}`;
const COMPLETE_KEY = `etymology_quiz_complete_level_${currentLevel}`;


// ==============================
// 文字列を安全にHTML表示するための関数
// ==============================

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


// ==============================
// 配列をシャッフルする関数
// ==============================

function shuffleArray(array) {
  const copied = [...array];

  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }

  return copied;
}


// ==============================
// タイマー停止関数
// ==============================

function clearAutoNextTimer() {
  if (autoNextTimer !== null) {
    clearTimeout(autoNextTimer);
    autoNextTimer = null;
  }
}

function clearCountdownTimer() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}


// ==============================
// カウントダウン表示関数
// ==============================

function renderTimerBar() {
  if (!timerBarEl) return;
  timerBarEl.textContent = countdownRemaining > 0 ? String(countdownRemaining) : "";
}

function startCountdown() {
  clearCountdownTimer();

  countdownRemaining = TIMER_START;

  if (timerBarEl) {
    timerBarEl.classList.remove("hidden");
  }

  renderTimerBar();

  countdownTimer = setInterval(() => {
    countdownRemaining -= 1;
    renderTimerBar();

    if (countdownRemaining <= 0) {
      clearCountdownTimer();
      autoRevealAnswer();
    }
  }, TIMER_STEP_MS);
}


// ==============================
// 音声ボタン表示更新
// ==============================

function updateSoundButton() {
  if (!soundToggleBtnEl) return;

  if (soundEnabled) {
    soundToggleBtnEl.textContent = "音声 ON";
    soundToggleBtnEl.classList.add("sound-on");
  } else {
    soundToggleBtnEl.textContent = "音声 OFF";
    soundToggleBtnEl.classList.remove("sound-on");
  }
}


// ==============================
// 単語読み上げ
// ==============================

function speakWord(text) {
  if (!soundEnabled) return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEAK_LANG;
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}


// ==============================
// localStorage 読み書き
// ==============================

function loadMasteredWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed);
  } catch (e) {
    return new Set();
  }
}

function saveMasteredWords(masteredWords) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...masteredWords]));
  } catch (e) {
    // 保存に失敗しても処理は止めない
  }
}

function saveCompleteFlag() {
  try {
    localStorage.setItem(COMPLETE_KEY, "true");
  } catch (e) {
    // 保存に失敗しても処理は止めない
  }
}

function clearMasteredWords() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COMPLETE_KEY);
  } catch (e) {
    // 削除失敗でも処理は止めない
  }
}


// ==============================
// 音声ボタンの設定
// ==============================

if (soundToggleBtnEl) {
  soundToggleBtnEl.onclick = () => {
    soundEnabled = !soundEnabled;
    updateSoundButton();

    if (!soundEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (soundEnabled && wordEl.textContent.trim()) {
      speakWord(wordEl.textContent.trim());
    }
  };

  updateSoundButton();
}


// ==============================
// データがないときの処理
// ==============================

if (!Array.isArray(window.quizData) || window.quizData.length === 0) {
  progressEl.textContent = "データがありません。";
  wordEl.textContent = "問題データを読み込めませんでした。";
  choice0El.classList.add("hidden");
  choice1El.classList.add("hidden");

  if (timerBarEl) {
    timerBarEl.classList.add("hidden");
  }
} else {
  // =====================================
  // クイズ本体
  // =====================================

  const allQuestions = shuffleArray([...window.quizData]);
  const totalQuestions = allQuestions.length;

  const masteredWords = loadMasteredWords();

  let questionQueue = shuffleArray(
    allQuestions.filter(q => !masteredWords.has(q.word))
  );

  let currentQuestion = null;
  let currentChoices = [];


  // ------------------------------
  // 進捗表示更新
  // ------------------------------

  function updateProgress() {
    progressEl.textContent = `正解 ${masteredWords.size} / ${totalQuestions}`;
  }


  // ------------------------------
  // メッセージ表示リセット
  // ------------------------------

  function resetMessage() {
    messageTextEl.textContent = "";
    messageEl.classList.add("hidden");
    messageEl.classList.remove("message-correct", "message-wrong");
    inlineNextBtnEl.classList.add("hidden");
  }


  // ------------------------------
  // 手動で次へ進む
  // ------------------------------

  function goNext() {
    clearAutoNextTimer();
    clearCountdownTimer();
    showQuestion();
  }


  // ------------------------------
  // 最初からやり直すボタン
  // ------------------------------

  if (resetNowBtnEl) {
    resetNowBtnEl.onclick = () => {
      const ok = window.confirm("このレベルの記録を消して最初からやり直しますか？");
      if (!ok) return;

      clearMasteredWords();
      location.href = `./quiz.html?level=${encodeURIComponent(currentLevel)}`;
    };
  }


  // ------------------------------
  // 一定時間後に自動で次へ
  // ------------------------------

  function scheduleNext(ms = AUTO_NEXT_MS) {
    clearAutoNextTimer();

    autoNextTimer = setTimeout(() => {
      showQuestion();
    }, ms);
  }


  // ------------------------------
  // まだ正解していない次の問題を取る
  // ------------------------------

  function getNextUnmasteredQuestion() {
    while (questionQueue.length > 0) {
      const nextQuestion = questionQueue.shift();

      if (!masteredWords.has(nextQuestion.word)) {
        return nextQuestion;
      }
    }

    return null;
  }


  // ------------------------------
  // 問題表示
  // ------------------------------

  function showQuestion() {
    clearAutoNextTimer();
    clearCountdownTimer();

    if (masteredWords.size >= totalQuestions) {
      saveCompleteFlag();
      showFinalPage(false);
      return;
    }

    currentQuestion = getNextUnmasteredQuestion();

    if (!currentQuestion) {
      showFinalPage(false);
      return;
    }

    currentChoices = shuffleArray(currentQuestion.choices);

    updateProgress();

    wordEl.textContent = currentQuestion.word;

    speakWord(currentQuestion.word);

    choice0El.textContent = currentChoices[0];
    choice1El.textContent = currentChoices[1];

    choice0El.disabled = false;
    choice1El.disabled = false;

    choice0El.classList.remove("hidden");
    choice1El.classList.remove("hidden");

    resetMessage();

    explanationEl.classList.add("hidden");
    explanationEl.innerHTML = "";

    if (timerBarEl) {
      timerBarEl.classList.remove("hidden");
    }

    choice0El.onclick = () => checkAnswer(currentChoices[0]);
    choice1El.onclick = () => checkAnswer(currentChoices[1]);

    startCountdown();
  }


  // ------------------------------
  // 時間切れ処理
  // ------------------------------

  function autoRevealAnswer() {
    if (timerBarEl) {
      timerBarEl.classList.add("hidden");
    }

    choice0El.disabled = true;
    choice1El.disabled = true;

    messageTextEl.textContent = "";
    messageEl.classList.add("hidden");
    inlineNextBtnEl.classList.remove("hidden");

    explanationEl.innerHTML = `
      <div class="answer-line">${escapeHtml(currentQuestion.word)} = ${escapeHtml(currentQuestion.correct)}</div>
      <div class="etymology-line">${escapeHtml(currentQuestion.etymology)}</div>
    `;
    explanationEl.classList.remove("hidden");

    if (!masteredWords.has(currentQuestion.word)) {
      questionQueue.push(currentQuestion);
    }

    scheduleNext();
  }


  // ------------------------------
  // 解答判定
  // ------------------------------

  function checkAnswer(selected) {
    clearCountdownTimer();

    if (timerBarEl) {
      timerBarEl.classList.add("hidden");
    }

    choice0El.disabled = true;
    choice1El.disabled = true;

    // 不正解
    if (selected !== currentQuestion.correct) {
      messageEl.classList.remove("hidden");
      messageEl.classList.remove("message-correct");
      messageEl.classList.add("message-wrong");
      inlineNextBtnEl.classList.remove("hidden");

      messageTextEl.textContent = "◾️◽️◾️◽️◾️Try again !◾️◽️◾️◽️◾️";

      explanationEl.innerHTML = `
        <div class="answer-line">${escapeHtml(currentQuestion.word)} = ${escapeHtml(currentQuestion.correct)}</div>
        <div class="etymology-line">${escapeHtml(currentQuestion.etymology)}</div>
        <div class="example-block">
          ${escapeHtml(currentQuestion.example1)}<br>
          ${escapeHtml(currentQuestion.jp1)}
        </div>
      `;
      explanationEl.classList.remove("hidden");

      if (!masteredWords.has(currentQuestion.word)) {
        questionQueue.push(currentQuestion);
      }

      scheduleNext();
      return;
    }

    // 正解
    masteredWords.add(currentQuestion.word);
    saveMasteredWords(masteredWords);
    updateProgress();

    if (masteredWords.size >= totalQuestions) {
      saveCompleteFlag();
    }

    messageEl.classList.remove("hidden");
    messageEl.classList.remove("message-wrong");
    messageEl.classList.add("message-correct");
    inlineNextBtnEl.classList.add("hidden");

    messageTextEl.textContent = "Excellent!";

    explanationEl.innerHTML = `
      <div class="answer-line">${escapeHtml(currentQuestion.word)} = ${escapeHtml(currentQuestion.correct)}</div>
    `;
    explanationEl.classList.remove("hidden");

    scheduleNext(300);
  }


  // ------------------------------
  // 結果画面
  // ------------------------------

  function showFinalPage(isEarlyFinish) {
    clearAutoNextTimer();
    clearCountdownTimer();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (timerBarEl) {
      timerBarEl.classList.add("hidden");
    }

    const rows = allQuestions.map((q) => {
      const mark = masteredWords.has(q.word) ? "○" : "";

      return `
        <tr>
          <td>${mark}</td>
          <td>${escapeHtml(q.word)}</td>
          <td>${escapeHtml(q.correct)}</td>
          <td>${escapeHtml(q.etymology)}</td>
        </tr>
      `;
    }).join("");

    const summaryText = isEarlyFinish
      ? `途中終了しました。全${totalQuestions}問中 ${masteredWords.size}問正解済みです。`
      : `全${totalQuestions}問中 ${masteredWords.size}問正解しました。`;

    document.querySelector(".container").innerHTML = `
      <div class="top-bar" style="margin-bottom: 20px;">
        <button type="button" class="back-link-button" onclick="location.href='./index.html'">← トップへ戻る</button>
        <div class="level-label">完了</div>
      </div>

      <div class="progress">${summaryText}</div>

      <div class="final-table-wrapper">
        <div class="final-title">このレベルの全単語一覧</div>

        <table class="final-table">
          <thead>
            <tr>
              <th style="width: 70px;">印</th>
              <th>単語</th>
              <th>意味</th>
              <th>読み方</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="final-actions">
          <button class="restart-button" onclick="location.href='./quiz.html?level=${encodeURIComponent(currentLevel)}'">続きからこのレベルをする</button>
          <button class="restart-button" onclick="window.resetLevelProgress()" style="margin-left: 12px;">最初からやり直す</button>
          <button class="restart-button" onclick="location.href='./index.html'" style="margin-left: 12px;">トップへ戻る</button>
        </div>
      </div>
    `;

    window.resetLevelProgress = function () {
      clearMasteredWords();
      location.href = `./quiz.html?level=${encodeURIComponent(currentLevel)}`;
    };
  }


  // ------------------------------
  // 上の「結果を見る」ボタン
  // ------------------------------

  if (finishNowBtnEl) {
    finishNowBtnEl.onclick = () => {
      showFinalPage(true);
    };
  }


  // ------------------------------
  // 下の「次へ」ボタン
  // ------------------------------

  inlineNextBtnEl.onclick = () => {
    goNext();
  };


  // ------------------------------
  // 開始
  // ------------------------------

  updateProgress();
  showQuestion();
}
