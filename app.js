const $ = (selector) => document.querySelector(selector);

let words = [];
let p5Words = [];
let grammarLessons = [];
let addedWords = [];
let current;
let cloze;
let grammarLesson;
let libraryReviewWords = [];
let libraryReviewIndex = 0;
let libraryReviewCurrent;

const savedProgress = localStorage.getItem("vocabProgress");
const oldWeakWords = JSON.parse(localStorage.getItem("weakWords") || "{}");

let progress = savedProgress
  ? JSON.parse(savedProgress)
  : Object.fromEntries(
      Object.entries(oldWeakWords).map(([en, wrong]) => [
        en,
        { wrong, streak: 0 }
      ])
    );

const shuffle = (array) => [...array].sort(() => Math.random() - 0.5);
const addedWordsStorageKey = "vocabularyAddWords";

function speakEnglish(text) {
  if (!("speechSynthesis" in window)) {
    alert("這個瀏覽器不支援英文發音功能。");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.85;

  window.speechSynthesis.speak(utterance);
}

function normalizeAddedWord(word) {
  return {
    en: String(word.en || "").trim(),
    zh: String(word.zh || "").trim(),
    example: String(word.example || "").trim(),
    inLibrary: Boolean(word.inLibrary),
    isCustom: true
  };
}

function uniqueAddedWords(items) {
  const seen = new Set();

  return items
    .map(normalizeAddedWord)
    .filter((word) => {
      const key = word.en.toLowerCase();

      if (!word.en || !word.zh || !word.example || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function saveAddedWords() {
  localStorage.setItem(addedWordsStorageKey, JSON.stringify(addedWords));
}

function getProgress(en) {
  if (!progress[en]) {
    progress[en] = { wrong: 0, streak: 0 };
  }

  return progress[en];
}

function getWeight(word) {
  const record = progress[word.en];

  if (!record) return 3;
  if (record.wrong > 0) return 8 + Math.min(record.wrong, 3) * 2;
  if (record.streak >= 5) return 1;
  if (record.streak >= 3) return 2;

  return 3;
}

function pickWeightedWord(pool) {
  const totalWeight = pool.reduce(
    (total, word) => total + getWeight(word),
    0
  );

  let point = Math.random() * totalWeight;

  for (const word of pool) {
    point -= getWeight(word);

    if (point <= 0) return word;
  }

  return pool[pool.length - 1];
}

function pickWord() {
  return pickWeightedWord(words);
}

function saveProgress() {
  localStorage.setItem("vocabProgress", JSON.stringify(progress));
  renderWeakCount();
}

function renderWeakCount() {
  const count = Object.values(progress).filter(
    (record) => record.wrong > 0
  ).length;

  $("#weakCount").textContent = count;
}

function markCorrect(en) {
  const record = getProgress(en);

  record.streak += 1;
  record.wrong = Math.max(0, record.wrong - 1);

  if (record.wrong === 0 && record.streak >= 3) {
    delete progress[en];
  }

  saveProgress();
}

function markWrong(en) {
  const record = getProgress(en);

  record.wrong += 1;
  record.streak = 0;

  saveProgress();
}

async function start() {
  try {
    const [allWords, businessWords, grammarData, savedAddedWords] =
      await Promise.all([
        fetch("./vocabulary.json").then((response) => response.json()),
        fetch("./vocabulary_p5.json").then((response) => response.json()),
        fetch("./grammar_lessons.json").then((response) => response.json()),
        fetch("./vocabulary_add.json").then((response) => response.json())
      ]);

    const localAddedWords = JSON.parse(
      localStorage.getItem(addedWordsStorageKey) || "[]"
    );

    addedWords = uniqueAddedWords([
      ...savedAddedWords,
      ...localAddedWords
    ]);

    const existingWords = new Set(
      allWords.map((word) => word.en.toLowerCase())
    );

    words = [
      ...allWords,
      ...addedWords.filter(
        (word) => !existingWords.has(word.en.toLowerCase())
      )
    ];

    p5Words = businessWords;
    grammarLessons = grammarData;

    renderWeakCount();
    newTranslate();
  } catch (error) {
    console.error(error);
    $("#translate").innerHTML =
      "<p>找不到資料檔，請確認所有 JSON 檔案和 index.html 放在同一個資料夾。</p>";
  }
}

function newTranslate() {
  current = pickWord();

  $("#word").textContent = current.en;
  $("#meaning").value = "";

  $("#feedback").classList.remove("show");
  $("#example").classList.remove("show");
  $("#nextAfterReview").classList.add("hidden");
  $("#know").classList.remove("hidden");
  $("#review").classList.remove("hidden");

  $("#meaning").focus();
  $("#bar").style.width = `${Math.random() * 70 + 20}%`;
}

function showAnswer() {
  if (!$("#meaning").value.trim()) return;

  $("#standard").textContent = current.zh;
  $("#feedback").classList.add("show");
}

function gradeTranslate(isCorrect) {
  if (isCorrect) {
    markCorrect(current.en);

    $("#word").classList.add("bobbing");

    setTimeout(() => {
      $("#word").classList.remove("bobbing");
      newTranslate();
    }, 650);

    return;
  }

  markWrong(current.en);

  $("#example").innerHTML = `<b>簡單例句</b><br>${current.example}`;
  $("#example").classList.add("show");

  $("#know").classList.add("hidden");
  $("#review").classList.add("hidden");
  $("#nextAfterReview").classList.remove("hidden");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getWordType(word) {
  const en = word.en.toLowerCase();

  if (en.endsWith("ly")) return "adverb";

  if (
    en.endsWith("tion") ||
    en.endsWith("ment") ||
    en.endsWith("ness") ||
    en.endsWith("ity") ||
    en.endsWith("er") ||
    en.endsWith("or")
  ) {
    return "noun";
  }

  if (
    en.endsWith("ive") ||
    en.endsWith("ful") ||
    en.endsWith("less") ||
    en.endsWith("ous") ||
    en.endsWith("al")
  ) {
    return "adjective";
  }

  if (
    en.endsWith("ate") ||
    en.endsWith("ize") ||
    en.endsWith("fy") ||
    en.endsWith("en")
  ) {
    return "verb";
  }

  return "other";
}

function makeClozeSentence(word) {
  const expression = new RegExp(`\\b${escapeRegExp(word.en)}\\b`, "i");

  if (!expression.test(word.example)) return null;

  return word.example.replace(expression, "______");
}

function pickClozeWord() {
  const usableWords = p5Words.filter((word) => makeClozeSentence(word));

  return pickWeightedWord(usableWords);
}

function getClozeOptions(answer) {
  const answerType = getWordType(answer);

  const sameType = p5Words.filter(
    (word) => word.en !== answer.en && getWordType(word) === answerType
  );

  const fallback = p5Words.filter((word) => word.en !== answer.en);
  const distractors = shuffle(sameType).slice(0, 3);

  if (distractors.length < 3) {
    distractors.push(
      ...shuffle(
        fallback.filter((word) => !distractors.includes(word))
      ).slice(0, 3 - distractors.length)
    );
  }

  return shuffle([answer, ...distractors]);
}

function newCloze() {
  cloze = pickClozeWord();

  const options = getClozeOptions(cloze);

  $("#clozeTitle").textContent = "選出最適合句意的單字";
  $("#clozeSentence").textContent = makeClozeSentence(cloze);
  $("#choices").innerHTML = "";
  $("#clozeNote").textContent = "";
  $("#nextCloze").classList.add("hidden");

  options.forEach((word) => {
    const button = document.createElement("button");

    button.className = "choice";
    button.textContent = word.en;
    button.onclick = () => answerCloze(button, word);

    $("#choices").append(button);
  });
}

function answerCloze(button, selectedWord) {
  if (!$("#nextCloze").classList.contains("hidden")) return;

  document.querySelectorAll("#choices .choice").forEach((item) => {
    item.disabled = true;
  });

  const isCorrect = selectedWord.en === cloze.en;

  button.classList.add(isCorrect ? "correct" : "wrong");

  if (isCorrect) {
    markCorrect(cloze.en);

    $("#clozeNote").innerHTML = `
      答對了！<b>${cloze.en}</b>＝${cloze.zh}<br><br>
      <b>中文：</b>${cloze.exampleZh || "（尚未提供中文句子）"}
    `;
  } else {
    markWrong(cloze.en);

    [...document.querySelectorAll("#choices .choice")]
      .find((item) => item.textContent === cloze.en)
      .classList.add("correct");

    $("#clozeNote").innerHTML = `
      正確答案是 <b>${cloze.en}</b>（${cloze.zh}）。<br><br>
      <b>中文：</b>${cloze.exampleZh || "（尚未提供中文句子）"}
    `;
  }

  $("#nextCloze").classList.remove("hidden");
}

function newGrammar() {
  grammarLesson =
    grammarLessons[Math.floor(Math.random() * grammarLessons.length)];

  $("#grammarTitle").textContent = grammarLesson.title;
  $("#grammarRule").textContent = grammarLesson.rule;
  $("#grammarQuestion").textContent = grammarLesson.question;
  $("#grammarChoices").innerHTML = "";
  $("#grammarNote").textContent = "";
  $("#nextGrammar").classList.add("hidden");

  shuffle(grammarLesson.options).forEach((option) => {
    const button = document.createElement("button");

    button.className = "choice";
    button.textContent = option;
    button.onclick = () => answerGrammar(button, option);

    $("#grammarChoices").append(button);
  });
}

function answerGrammar(button, selectedOption) {
  if (!$("#nextGrammar").classList.contains("hidden")) return;

  document.querySelectorAll("#grammarChoices .choice").forEach((item) => {
    item.disabled = true;
  });

  const isCorrect = selectedOption === grammarLesson.answer;

  button.classList.add(isCorrect ? "correct" : "wrong");

  if (!isCorrect) {
    [...document.querySelectorAll("#grammarChoices .choice")]
      .find((item) => item.textContent === grammarLesson.answer)
      .classList.add("correct");

    $("#grammarNote").innerHTML =
      `正確答案是 <b>${grammarLesson.answer}</b>。${grammarLesson.explanation}`;
  } else {
    $("#grammarNote").textContent = `答對了！${grammarLesson.explanation}`;
  }

  $("#nextGrammar").classList.remove("hidden");
}

function getLibraryWords() {
  return words.filter(
    (word) => progress[word.en]?.wrong > 0 || (word.isCustom && word.inLibrary)
  );
}

function renderLibrary() {
  const list = $("#libraryList");
  const items = getLibraryWords();

  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = '<div class="empty">目前沒有待複習單字。</div>';
    return;
  }

  items
    .sort(
      (a, b) =>
        (progress[b.en]?.wrong || 0) - (progress[a.en]?.wrong || 0)
    )
    .forEach((word) => {
      const row = document.createElement("div");
      const wrong = progress[word.en]?.wrong || 0;

      row.className = "library-row";
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `播放 ${word.en} 的英文發音`);

      row.innerHTML = `
        <div>
          <b>${word.en}</b> <span aria-hidden="true">🔉</span>
          <div class="small">${word.zh}</div>
        </div>
        <div class="library-tags">
          ${word.isCustom ? '<span class="badge custom-badge">自行加入</span>' : ""}
          ${wrong > 0 ? `<span class="badge">答錯 ${wrong} 次</span>` : ""}
        </div>
      `;

      row.onclick = () => speakEnglish(word.en);

      row.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          speakEnglish(word.en);
        }
      };

      list.append(row);
    });
}

function startLibraryReview() {
  const items = getLibraryWords();

  if (!items.length) {
    alert("目前沒有待複習的錯題。先完成幾題練習後再來吧！");
    return;
  }

  libraryReviewWords = shuffle(items);
  libraryReviewIndex = 0;

  showView("libraryReview");
  newLibraryReviewWord();
}

function newLibraryReviewWord() {
  if (libraryReviewIndex >= libraryReviewWords.length) {
    alert("這一輪錯題複習完成！");
    showView("library");
    return;
  }

  libraryReviewCurrent = libraryReviewWords[libraryReviewIndex];

  $("#libraryReviewWord").textContent = libraryReviewCurrent.en;
  $("#libraryReviewAnswer").classList.remove("show");
  $("#nextLibraryReview").classList.add("hidden");
  $("#showLibraryReviewAnswer").classList.remove("hidden");
  $("#libraryReviewKnow").classList.remove("hidden");
  $("#libraryReviewAgain").classList.remove("hidden");
}

function showLibraryReviewAnswer() {
  $("#libraryReviewMeaning").textContent = libraryReviewCurrent.zh;

  $("#libraryReviewExample").innerHTML = `
    <b>簡單例句</b><br>
    ${libraryReviewCurrent.example}
    ${libraryReviewCurrent.exampleZh
      ? `<br><span class="small">${libraryReviewCurrent.exampleZh}</span>`
      : ""}
  `;

  $("#libraryReviewAnswer").classList.add("show");
  $("#showLibraryReviewAnswer").classList.add("hidden");
}

function gradeLibraryReview(isCorrect) {
  if (isCorrect) {
    markCorrect(libraryReviewCurrent.en);
  } else {
    markWrong(libraryReviewCurrent.en);
  }

  $("#libraryReviewKnow").classList.add("hidden");
  $("#libraryReviewAgain").classList.add("hidden");
  $("#nextLibraryReview").classList.remove("hidden");
}

function nextLibraryReview() {
  libraryReviewIndex += 1;
  newLibraryReviewWord();
}

function showView(viewName) {
  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewName);
  });

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("hidden", view.id !== viewName);
  });

  if (viewName === "library") renderLibrary();
  if (viewName === "cloze") newCloze();
  if (viewName === "grammar") newGrammar();
}

function addWord(event) {
  event.preventDefault();

  const newWord = normalizeAddedWord({
    en: $("#addEnglish").value,
    zh: $("#addChinese").value,
    example: $("#addExample").value,
    inLibrary: $("#addToLibrary").checked
  });

  if (!newWord.en || !newWord.zh || !newWord.example) {
    $("#addWordNote").textContent = "請把英文、中文和例句都填完整。";
    return;
  }

  if (words.some((word) => word.en.toLowerCase() === newWord.en.toLowerCase())) {
    $("#addWordNote").textContent = "這個英文單字已經存在，請確認拼字。";
    return;
  }

  addedWords.push(newWord);
  words.push(newWord);
  saveAddedWords();

  $("#addWordForm").reset();
  $("#addToLibrary").checked = true;
  $("#addWordNote").textContent = "已加入。";
}

function downloadAddedWords() {
  const file = new Blob([JSON.stringify(addedWords, null, 2)], {
    type: "application/json"
  });

  const link = document.createElement("a");

  link.href = URL.createObjectURL(file);
  link.download = "vocabulary_add.json";
  link.click();

  URL.revokeObjectURL(link.href);
}

document.querySelectorAll(".tab[data-view]").forEach((tab) => {
  tab.onclick = () => {
    showView(tab.dataset.view);
  };
});

$("#check").onclick = showAnswer;

$("#meaning").onkeydown = (event) => {
  if (event.key === "Enter") showAnswer();
};

$("#know").onclick = () => gradeTranslate(true);
$("#review").onclick = () => gradeTranslate(false);
$("#nextAfterReview").onclick = newTranslate;
$("#nextCloze").onclick = newCloze;
$("#nextGrammar").onclick = newGrammar;
$("#startLibraryReview").onclick = startLibraryReview;
$("#showLibraryReviewAnswer").onclick = showLibraryReviewAnswer;
$("#libraryReviewSpeak").onclick = () => speakEnglish(libraryReviewCurrent.en);
$("#libraryReviewKnow").onclick = () => gradeLibraryReview(true);
$("#libraryReviewAgain").onclick = () => gradeLibraryReview(false);
$("#nextLibraryReview").onclick = nextLibraryReview;
$("#backToLibrary").onclick = () => showView("library");

$("#addWord").onclick = () => {
  $("#addWordForm").reset();
  $("#addToLibrary").checked = true;
  $("#addWordNote").textContent = "";

  showView("addWordPage");
  $("#addEnglish").focus();
};

$("#cancelAddWord").onclick = () => showView("library");
$("#addWordForm").onsubmit = addWord;
$("#downloadAddedWords").onclick = downloadAddedWords;

$("#clearWeak").onclick = () => {
  if (confirm("確定清空待複習紀錄？")) {
    progress = {};

    localStorage.removeItem("weakWords");
    saveProgress();
    renderLibrary();
  }
};

start();