// ==============================
// 設定
// ==============================

const AUTO_NEXT_MS = 4500;
const TIMER_START = 5;
const TIMER_STEP_MS = 1000;


// ==============================
// HTML要素の取得
// ==============================

const progressEl = document.getElementById("progress");
const timerBarEl = document.getElementById("timerBar");
const wordEl = document.getElementById("word");

const answerInputEl = document.getElementById("answerInput");
const answerBtnEl = document.getElementById("answerBtn");

const messageEl = document.getElementById("message");
const messageTextEl = document.getElementById("messageText");
const inlineNextBtnEl = document.getElementById("inlineNextBtn");
const explanationEl = document.getElementById("explanation");

const finishNowBtnEl = document.getElementById("finishNowBtn");
const resetNowBtnEl = document.getElementById("resetNowBtn");


// ==============================
// 内部状態
// ==============================

let autoNextTimer = null;
let countdownTimer = null;
let countdownRemaining = TIMER_START;


// ==============================
// レベルと保存キー
// ==============================

const currentLevel = new URLSearchParams(window.location.search).get("level") || "1";

const STORAGE_KEY = `phrasal_quiz_mastered_level_${currentLevel}`;
const COMPLETE_KEY = `phrasal_quiz_complete_level_${currentLevel}`;


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
// 入力された答えを整える関数
// ==============================

function normalizeAnswer(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


// ==============================
// 答えが1語かどうか確認する関数
// ==============================

function isOneWord(value) {
  const normalized = normalizeAnswer(value);

  if (normalized === "") {
    return false;
  }

  return normalized.split(" ").length === 1;
}


// ==============================
// 完成した句動詞を作る関数
// ==============================

function getCompletedPhrase(question) {
  return String(question.word).replace("___", question.correct);
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
    // 削除に失敗しても処理は止めない
  }
}


// ==============================
// データ確認
// ==============================

function hasValidQuizData() {
  return Array.isArray(window.quizData) && window.quizData.length > 0;
}

function findInvalidQuestions() {
  if (!Array.isArray(window.quizData)) return [];

  return window.quizData.filter((q) => {
    if (!q) return true;
    if (!q.word) return true;
    if (!q.sentence) return true;
    if (!q.correct) return true;
    if (!q.meaning) return true;
    if (!String(q.word).includes("___")) return true;
    if (!String(q.sentence).includes("___")) return true;
    if (!isOneWord(q.correct)) return true;

    return false;
  });
}


// ==============================
// データがないとき・データ不備の処理
// ==============================

if (!hasValidQuizData()) {
  progressEl.textContent = "データがありません。";
  wordEl.textContent = "問題データを読み込めませんでした。";

  if (answerInputEl) answerInputEl.classList.add("hidden");
  if (answerBtnEl) answerBtnEl.classList.add("hidden");
  if (timerBarEl) timerBarEl.classList.add("hidden");

} else if (findInvalidQuestions().length > 0) {
  const invalidQuestions = findInvalidQuestions();

  progressEl.textContent = "データに誤りがあります。";
  wordEl.textContent = "word / sentence / correct / meaning を確認してください。correct は必ず1語にしてください。";

  if (answerInputEl) answerInputEl.classList.add("hidden");
  if (answerBtnEl) answerBtnEl.classList.add("hidden");
  if (timerBarEl) timerBarEl.classList.add("hidden");

  console.error("不備のある問題データ:", invalidQuestions);

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
  // 入力欄を有効にする
  // ------------------------------

  function enableInput() {
    answerInputEl.disabled = false;
    answerBtnEl.disabled = false;

    answerInputEl.classList.remove("hidden");
    answerBtnEl.classList.remove("hidden");

    answerInputEl.focus();
  }


  // ------------------------------
  // 入力欄を無効にする
  // ------------------------------

  function disableInput() {
    answerInputEl.disabled = true;
    answerBtnEl.disabled = true;
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

    updateProgress();

    wordEl.textContent = currentQuestion.sentence;

    answerInputEl.value = "";
    enableInput();

    resetMessage();

    explanationEl.classList.add("hidden");
    explanationEl.innerHTML = "";

    if (timerBarEl) {
      timerBarEl.classList.remove("hidden");
    }

    startCountdown();
  }


  // ------------------------------
  // 時間切れ処理
  // ------------------------------

  function autoRevealAnswer() {
    if (!currentQuestion) return;

    if (timerBarEl) {
      timerBarEl.classList.add("hidden");
    }

    disableInput();

    messageTextEl.textContent = "";
    messageEl.classList.add("hidden");
    inlineNextBtnEl.classList.remove("hidden");

    explanationEl.innerHTML = `
      <div class="answer-line">
        ${escapeHtml(getCompletedPhrase(currentQuestion))} = ${escapeHtml(currentQuestion.meaning)}
      </div>
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

  function checkAnswer(inputValue) {
    if (!currentQuestion) return;

    const userAnswer = normalizeAnswer(inputValue);
    const correctAnswer = normalizeAnswer(currentQuestion.correct);

    // 空欄または2語以上の場合
    if (!isOneWord(userAnswer)) {
      messageEl.classList.remove("hidden");
      messageEl.classList.remove("message-correct");
      messageEl.classList.add("message-wrong");
      inlineNextBtnEl.classList.add("hidden");

      messageTextEl.textContent = "答えは1語だけ入力してください。";

      enableInput();
      return;
    }

    clearCountdownTimer();

    if (timerBarEl) {
      timerBarEl.classList.add("hidden");
    }

    disableInput();

    // 不正解
    if (userAnswer !== correctAnswer) {
      messageEl.classList.remove("hidden");
      messageEl.classList.remove("message-correct");
      messageEl.classList.add("message-wrong");
      inlineNextBtnEl.classList.remove("hidden");

      messageTextEl.textContent = "◾️◽️◾️◽️◾️Try again !◾️◽️◾️◽️◾️";

      explanationEl.innerHTML = `
        <div class="answer-line">
          ${escapeHtml(getCompletedPhrase(currentQuestion))} = ${escapeHtml(currentQuestion.meaning)}
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
      <div class="answer-line">
        ${escapeHtml(getCompletedPhrase(currentQuestion))} = ${escapeHtml(currentQuestion.meaning)}
      </div>
    `;
    explanationEl.classList.remove("hidden");

    scheduleNext(300);
  }


  // ------------------------------
  // 答えるボタン
  // ------------------------------

  answerBtnEl.onclick = () => {
    if (answerInputEl.disabled) return;

    checkAnswer(answerInputEl.value);
  };


  // ------------------------------
  // Return / Enter キーで答える
  // ------------------------------

  answerInputEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();

    if (answerInputEl.disabled) return;

    checkAnswer(answerInputEl.value);
  });


  // ------------------------------
  // 結果画面
  // ------------------------------

  function showFinalPage(isEarlyFinish) {
    clearAutoNextTimer();
    clearCountdownTimer();

    if (timerBarEl) {
      timerBarEl.classList.add("hidden");
    }

    const rows = allQuestions.map((q) => {
      const mark = masteredWords.has(q.word) ? "○" : "";

      return `
        <tr>
          <td>${mark}</td>
          <td>${escapeHtml(getCompletedPhrase(q))}</td>
          <td>${escapeHtml(q.meaning)}</td>
          <td>${escapeHtml(q.sentence)}</td>
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
        <div class="final-title">このレベルの全句動詞一覧</div>

        <table class="final-table">
          <thead>
            <tr>
              <th style="width: 70px;">印</th>
              <th>句動詞</th>
              <th>意味</th>
              <th>例文</th>
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
