const $ = (selector) => document.querySelector(selector);

let words = [];
let p5Words = [];
let grammarLessons = [];
let grammarQuestions = [];
let grammarReviewMode = false;
let grammarProgress = JSON.parse(
  localStorage.getItem("grammarProgress") || "{}"
);
let addedWords = [];
let reservedWords = [];
let masteredWords = new Set(
  JSON.parse(localStorage.getItem("masteredVocabularyWordsV2") || "[]")
);
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
  const availableWords = words.filter(
    (word) => !masteredWords.has(word.en)
  );

  return availableWords.length ? pickWeightedWord(availableWords) : null;
}

function saveProgress() {
  localStorage.setItem("vocabProgress", JSON.stringify(progress));
  localStorage.setItem(
    "masteredVocabularyWordsV2",
    JSON.stringify([...masteredWords])
  );
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
  record.masteryStreak = (record.masteryStreak || 0) + 1;

  if (record.masteryStreak >= 3) {
    masteredWords.add(en);
    delete progress[en];
  }

  saveProgress();
}

function markWrong(en) {
  const record = getProgress(en);

  record.wrong += 1;
  record.streak = 0;
  record.masteryStreak = 0;

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

    reservedWords = uniqueAddedWords(savedAddedWords);
    addedWords = uniqueAddedWords(localAddedWords);

    const existingWords = new Set(
      [...allWords, ...reservedWords].map((word) => word.en.toLowerCase())
    );

    words = [
      ...allWords,
      ...addedWords.filter(
        (word) => !existingWords.has(word.en.toLowerCase())
      )
    ];

    p5Words = businessWords;
    grammarLessons = grammarData;

    grammarQuestions = grammarData.flatMap((lesson) =>
      lesson.questions.map((question) => ({
        ...lesson,
        ...question
      }))
    );

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

  $("#feedback").classList.remove("show");
  $("#nextAfterReview").classList.add("hidden");
  $("#know").classList.remove("hidden");
  $("#review").classList.remove("hidden");
  $("#promptExample").classList.add("show");
  $("#check").classList.remove("hidden");

  if (!current) {
    $("#word").textContent = "🎉 全部單字都已連續答對 3 次！";
    $("#promptExample").classList.remove("show");
    $("#check").classList.add("hidden");
    $("#bar").style.width = "100%";
    return;
  }

  $("#word").textContent = current.en;
  $("#promptExampleText").textContent =
    current.example_ivan || current.example || "（尚未提供例句）";

  $("#bar").style.width = `${Math.random() * 70 + 20}%`;
}

function showAnswer() {
  $("#standard").textContent = current.zh || "（）";
  $("#answerExample").textContent = current.example || "（）";
  $("#answerExampleIvan").textContent =
    current.example_ivan || "（）";
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
  const usableWords = p5Words.filter(
    (word) =>
      !masteredWords.has(word.en) && makeClozeSentence(word)
  );

  return usableWords.length ? pickWeightedWord(usableWords) : null;
}

function getClozeOptions(answer) {
  const answerType = getWordType(answer);

  const sameType = p5Words.filter(
    (word) =>
      !masteredWords.has(word.en) &&
      word.en !== answer.en &&
      getWordType(word) === answerType
  );

  const fallback = p5Words.filter(
    (word) => !masteredWords.has(word.en) && word.en !== answer.en
  );

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

  if (!cloze) {
    $("#clozeTitle").textContent = "目前沒有待練習的填空單字";
    $("#clozeSentence").textContent = "";
    $("#choices").innerHTML = "";
    $("#clozeNote").textContent = "目前沒有可出題的單字，或可練習的單字都已連續答對 3 次。";
    $("#nextCloze").classList.add("hidden");
    return;
  }
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
  if (!grammarQuestions.length) return;

  const pool = grammarReviewMode
    ? grammarQuestions.filter(
        (question) => grammarProgress[question.id]?.wrong > 0
      )
    : grammarQuestions;

  if (!pool.length) {
    alert("目前沒有文法錯題，先進行文法測驗吧！");
    showGrammarPanel("test");
    return;
  }

  const expandedPool = pool.flatMap((question) => {
    const wrong = grammarProgress[question.id]?.wrong || 0;

    return Array(wrong > 0 ? 1 + Math.min(wrong, 3) * 2 : 1).fill(question);
  });

  grammarLesson =
    expandedPool[Math.floor(Math.random() * expandedPool.length)];

  $("#grammarTitle").textContent = "文法測驗";
  $("#grammarRule").textContent = "";
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

  const isCorrect = selectedOption === grammarLesson.answer;

  $("#grammarChoices").querySelectorAll(".choice").forEach((item) => {
    item.disabled = true;

    if (item.textContent === grammarLesson.answer) {
      item.classList.add("correct");
    }
  });

  if (!isCorrect) button.classList.add("wrong");

  const record = grammarProgress[grammarLesson.id] || {
    wrong: 0,
    correctStreak: 0
  };

  if (isCorrect) {
    record.correctStreak += 1;
    record.wrong = Math.max(0, record.wrong - 1);
  } else {
    record.wrong += 1;
    record.correctStreak = 0;
  }

  grammarProgress[grammarLesson.id] = record;
  localStorage.setItem("grammarProgress", JSON.stringify(grammarProgress));

  $("#grammarNote").innerHTML = isCorrect
    ? `答對了！${grammarLesson.note}`
    : `正確答案是 <b>${grammarLesson.answer}</b>。${grammarLesson.note}`;

  $("#nextGrammar").classList.remove("hidden");
  renderGrammarWrongList();
}

function getLibraryWords() {
  return words.filter(
    (word) =>
      !masteredWords.has(word.en) &&
      (progress[word.en]?.wrong > 0 || (word.isCustom && word.inLibrary))
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

function showGrammarPanel(panelName) {
  document.querySelectorAll(".grammar-tab").forEach((tab) => {
    tab.classList.toggle(
      "active",
      tab.dataset.grammarPanel === panelName
    );
  });

  $("#grammarStudyPanel").classList.toggle(
    "hidden",
    panelName !== "study"
  );

  $("#grammarTestPanel").classList.toggle(
    "hidden",
    panelName !== "test"
  );

  $("#grammarWrongPanel").classList.toggle(
    "hidden",
    panelName !== "wrong"
  );

  if (panelName === "study") {
    renderGrammarStudy();
  }

  if (panelName === "test") {
    grammarReviewMode = false;
    newGrammar();
  }

  if (panelName === "wrong") {
    renderGrammarWrongList();
  }
}

function renderGrammarStudy() {
  $("#grammarStudyList").innerHTML = grammarLessons
    .map(
      (lesson) => `
        <article class="grammar-card">
          <h3>${lesson.title}</h3>
          <p><b>規則：</b>${lesson.lesson.rule}</p>
          <p><b>怎麼判斷：</b>${lesson.lesson.howToJudge}</p>
          <p class="small">
            <b>例子：</b>${lesson.lesson.examples.join("、")}
          </p>
        </article>
      `
    )
    .join("");
}

function renderGrammarWrongList() {
  const wrongQuestions = grammarQuestions.filter(
    (question) => grammarProgress[question.id]?.wrong > 0
  );

  if (!wrongQuestions.length) {
    $("#grammarWrongList").innerHTML =
      '<div class="empty">目前沒有文法錯題。</div>';
    return;
  }

  $("#grammarWrongList").innerHTML = wrongQuestions
    .map(
      (question) => `
        <article class="grammar-card">
          <b>${question.title}</b>
          <p>${question.question}</p>
          <span class="badge">
            答錯 ${grammarProgress[question.id].wrong} 次
          </span>
        </article>
      `
    )
    .join("");
}

function startGrammarWrongReview() {
  const hasWrongQuestion = grammarQuestions.some(
    (question) => grammarProgress[question.id]?.wrong > 0
  );

  if (!hasWrongQuestion) {
    alert("目前沒有文法錯題。");
    return;
  }

  grammarReviewMode = true;

  $("#grammarStudyPanel").classList.add("hidden");
  $("#grammarTestPanel").classList.remove("hidden");
  $("#grammarWrongPanel").classList.add("hidden");

  document.querySelectorAll(".grammar-tab").forEach((tab) => {
    tab.classList.toggle(
      "active",
      tab.dataset.grammarPanel === "test"
    );
  });

  newGrammar();
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
  if (viewName === "grammar") showGrammarPanel("study");
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

  const wordKey = newWord.en.toLowerCase();

  if (
    words.some((word) => word.en.toLowerCase() === wordKey) ||
    reservedWords.some((word) => word.en.toLowerCase() === wordKey)
  ) {
    $("#addWordNote").textContent =
      "這個英文單字已經存在於單字庫或進階單字檔中。";
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
  const downloadableWords = uniqueAddedWords([
    ...reservedWords,
    ...addedWords
  ]);
  const file = new Blob([JSON.stringify(downloadableWords, null, 2)], {
    type: "application/json"
  });

  const link = document.createElement("a");

  link.href = URL.createObjectURL(file);
  link.download = "vocabulary_add.json";
  link.click();

  URL.revokeObjectURL(link.href);
}

function exportVocabulary() {
  const exportedAt = new Date().toISOString();

  const vocabulary = words
    .filter((word) => progress[word.en]?.wrong > 0)
    .map((word) => ({
    en: word.en,
    zh: word.zh,
    example: word.example,
    ...(word.exampleZh ? { exampleZh: word.exampleZh } : {}),
    ...(word.isCustom ? { isCustom: true } : {}),
    ...(word.inLibrary ? { inLibrary: true } : {}),
    progress: {
      wrong: progress[word.en]?.wrong || 0,
      streak: progress[word.en]?.streak || 0
    }
  }));

  const exportData = {
    exportedAt,
    totalWords: vocabulary.length,
    weakWords: vocabulary.filter((word) => word.progress.wrong > 0).length,
    vocabulary
  };

  const file = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json"
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "vocabulary_export.json";
  link.click();

  URL.revokeObjectURL(link.href);
}

document.querySelectorAll(".tab[data-view]").forEach((tab) => {
  tab.onclick = () => {
    showView(tab.dataset.view);
  };
});

$("#check").onclick = showAnswer;

$("#know").onclick = () => gradeTranslate(true);
$("#review").onclick = () => gradeTranslate(false);
$("#nextAfterReview").onclick = newTranslate;
$("#nextCloze").onclick = newCloze;
$("#nextGrammar").onclick = newGrammar;
document.querySelectorAll(".grammar-tab").forEach((tab) => {
  tab.onclick = () => showGrammarPanel(tab.dataset.grammarPanel);
});

$("#startGrammarWrongReview").onclick = startGrammarWrongReview;
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
$("#exportVocabulary").onclick = exportVocabulary;
let frequentCards = [];
let frequentCardIndex = 0;

async function startFrequentReview() {
  const button = $("#startFrequentReview");
  button.disabled = true;

  try {
    if (!frequentCards.length) {
      const response = await fetch("./frequent_wrong_words.json");

      if (!response.ok) {
        throw new Error(`讀取失敗：${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data.cards) || !data.cards.length) {
        throw new Error("JSON 裡沒有卡片資料。");
      }

      frequentCards = data.cards;
    }

    frequentCardIndex = 0;
    renderFrequentCard();
    showView("frequentReview");
  } catch (error) {
    console.error(error);
    alert(
      "無法讀取單字卡，請確認 frequent_wrong_words.json 和 index.html 放在同一個資料夾，且 JSON 格式正確。"
    );
  } finally {
    button.disabled = false;
  }
}

// 使用 textContent，讓 JSON 內容以純文字安全呈現。
function addFrequentText(parent, tag, text, className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function renderFrequentCard() {
  const card = frequentCards[frequentCardIndex];
  const content = $("#frequentReviewContent");

  $("#frequentReviewProgress").textContent =
    `${frequentCardIndex + 1} / ${frequentCards.length}`;

  $("#frequentReviewWord").textContent = card.en;

  // 每換一張，都先顯示正面。
  content.classList.add("hidden");
  content.replaceChildren();
  $("#flipFrequentReview").textContent = "翻面看內容";
  $("#flipFrequentReview").setAttribute("aria-expanded", "false");

  if (card.baseForm && card.baseForm !== card.en) {
    addFrequentText(content, "p", `原形：${card.baseForm}`, "small");
  }

  for (const definition of card.definitions || []) {
    const block = document.createElement("div");
    block.className = "frequent-definition";

    addFrequentText(
      block,
      "h3",
      `${definition.pos}：${definition.meaning}`
    );
    addFrequentText(block, "p", definition.example);
    addFrequentText(block, "p", definition.exampleZh, "small");

    content.append(block);
  }

  if (card.collocations?.length) {
    addFrequentText(content, "h3", "常見搭配");

    for (const item of card.collocations) {
      addFrequentText(content, "p", `${item.en}＝${item.zh}`);
    }
  }

  if (card.memory?.text) {
    addFrequentText(content, "h3", `💡 ${card.memory.type}`);
    addFrequentText(content, "p", card.memory.text);
  }

  if (card.relatedWords?.length) {
    addFrequentText(content, "h3", "相關字");

    for (const item of card.relatedWords) {
      const block = document.createElement("div");
      block.className = "frequent-definition";

      addFrequentText(block, "strong", `${item.en}＝${item.zh}`);

      if (item.example) {
        addFrequentText(block, "p", item.example);
      }

      if (item.exampleZh) {
        addFrequentText(block, "p", item.exampleZh, "small");
      }

      content.append(block);
    }
  }

  if (card.notes?.length) {
    addFrequentText(content, "h3", "小提醒");

    for (const note of card.notes) {
      addFrequentText(content, "p", `• ${note}`, "small");
    }
  }

  $("#previousFrequentReview").disabled = frequentCardIndex === 0;
  $("#nextFrequentReview").disabled = false;
  $("#nextFrequentReview").textContent =
    frequentCardIndex === frequentCards.length - 1
      ? "回到第一張"
      : "下一張";
  }

function moveFrequentCard(step) {
  const nextIndex = (frequentCardIndex + step + frequentCards.length) % frequentCards.length;

  if (nextIndex < 0 || nextIndex >= frequentCards.length) return;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  frequentCardIndex = nextIndex;
  renderFrequentCard();
  $("#frequentReview").scrollIntoView({ block: "start" });
}

$("#startFrequentReview").onclick = startFrequentReview;

$("#flipFrequentReview").onclick = () => {
  const content = $("#frequentReviewContent");
  const isHidden = content.classList.toggle("hidden");

  $("#flipFrequentReview").textContent =
    isHidden ? "翻面看內容" : "回到正面";

  $("#flipFrequentReview").setAttribute(
    "aria-expanded",
    String(!isHidden)
  );
};

$("#frequentReviewSpeak").onclick = () => {
  const card = frequentCards[frequentCardIndex];
  if (card) speakEnglish(card.en);
};

$("#previousFrequentReview").onclick = () => moveFrequentCard(-1);
$("#nextFrequentReview").onclick = () => moveFrequentCard(1);

$("#backFromFrequentReview").onclick = () => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  showView("library");
};

$("#clearWeak").onclick = () => {
  if (confirm("確定清空待複習紀錄？")) {
    progress = {};

    localStorage.removeItem("weakWords");
    saveProgress();
    renderLibrary();
  }
};

let relatedGroups = [];
let relatedIndex = 0;

function renderRelatedGroup() {
  const group = relatedGroups[relatedIndex];

  if (!group) return;

  $("#relatedCounter").textContent =
    `第 ${relatedIndex + 1} 組／共 ${relatedGroups.length} 組`;

  $("#relatedType").textContent = group.type;
  $("#relatedWords").textContent = group.words.join(" / ");

  // 每個分號後換行，方便閱讀各個單字的差別。
  $("#relatedExplanation").textContent = group.explanation.replace(/[；;]/g, "$&\n");

  $("#previousRelated").disabled = false;
  $("#nextRelated").disabled = false;
}

async function loadRelatedGroups() {
  $("#previousRelated").disabled = true;
  $("#nextRelated").disabled = true;
  $("#relatedCounter").textContent = "載入中…";

  try {
    const response = await fetch("./related_words.json");

    if (!response.ok) {
      throw new Error(`讀取失敗：${response.status}`);
    }

    const data = await response.json();

    if (
      !Array.isArray(data) ||
      !data.length ||
      !data.every(
        (group) =>
          Array.isArray(group.words) &&
          group.words.every((word) => typeof word === "string") &&
          typeof group.type === "string" &&
          typeof group.explanation === "string"
      )
    ) {
      throw new Error("近義字資料格式不正確");
    }

    relatedGroups = data;
    relatedIndex = 0;
    renderRelatedGroup();
  } catch (error) {
    console.error(error);

    $("#relatedCounter").textContent = "無法載入複習資料";
    $("#relatedExplanation").textContent =
      "請確認 related_words.json 和 index.html 放在同一個資料夾。";
  }
}

$("#previousRelated").onclick = () => {
  if (!relatedGroups.length) return;

  relatedIndex =
    (relatedIndex - 1 + relatedGroups.length) % relatedGroups.length;

  renderRelatedGroup();
};

$("#nextRelated").onclick = () => {
  if (!relatedGroups.length) return;

  relatedIndex = (relatedIndex + 1) % relatedGroups.length;

  renderRelatedGroup();
};

loadRelatedGroups();
function showVocabularyPanel(panelName) {
  document.querySelectorAll(".vocabulary-tab").forEach((tab) => {
    tab.classList.toggle(
      "active",
      tab.dataset.vocabularyPanel === panelName
    );
  });

  $("#vocabularyWordsPanel").classList.toggle(
    "hidden",
    panelName !== "words"
  );

  $("#vocabularyRelatedPanel").classList.toggle(
    "hidden",
    panelName !== "related"
  );

  $("#vocabularyConfusingPanel").classList.toggle(
    "hidden",
    panelName !== "confusing"
  );
}

document.querySelectorAll(".vocabulary-tab").forEach((tab) => {
  tab.onclick = () => {
    showVocabularyPanel(tab.dataset.vocabularyPanel);
  };
});

let listeningWords = [];
let listeningQueue = [];
let listeningCurrent = null;
let listeningAnswered = false;
let listeningQuestionNumber = 0;
let listeningCorrectCount = 0;

// Fisher–Yates 洗牌，不更動原陣列。
function shuffleListening(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function beginListening() {
  if (!("speechSynthesis" in window)) {
    alert("這個瀏覽器不支援英文發音功能。");
    return;
  }

  // 僅使用主單字檔中確實有 Ivan 例句的單字。
  // 不使用進階單字檔、填空題庫或自行新增單字。
  const uniqueWords = new Map();

  for (const word of words) {
    if (
      typeof word.example_ivan === "string" &&
      word.example_ivan.trim() &&
      typeof word.en === "string" &&
      word.en.trim() &&
      typeof word.zh === "string" &&
      word.zh.trim()
    ) {
      const key = word.en.trim().toLowerCase();

      if (!uniqueWords.has(key)) {
        uniqueWords.set(key, word);
      }
    }
  }

  listeningWords = [...uniqueWords.values()];
  listeningQueue = shuffleListening(listeningWords);
  listeningQuestionNumber = 0;
  listeningCorrectCount = 0;

  $("#startListening").classList.add("hidden");
  $("#listeningQuestion").classList.remove("hidden");

  newListeningQuestion();
}

function newListeningQuestion() {
  if (!listeningQueue.length) {
    listeningCurrent = null;

    $("#listeningQuestion").classList.add("hidden");
    $("#startListening").classList.remove("hidden");
    $("#startListening").textContent = "再練習一輪";

    $("#listeningCounter").textContent =
      `本輪完成！共 ${listeningWords.length} 題，` +
      `答對 ${listeningCorrectCount} 題。`;

    return;
  }

  listeningCurrent = listeningQueue.pop();
  listeningAnswered = false;
  listeningQuestionNumber += 1;

  $("#listeningCounter").textContent =
    `第 ${listeningQuestionNumber}／${listeningWords.length} 題`;

  $("#listeningFeedback").classList.remove("show");
  $("#nextListening").classList.add("hidden");
  $("#listeningChoices").replaceChildren();

  $("#listeningResult").textContent = "";
  $("#listeningAnswer").textContent = "";
  $("#listeningExample").textContent = "";

  // 中文選項也只取自這 317 個單字。
  // 相同中文不會重複出現在同一題。
  const otherMeanings = [
    ...new Set(
      listeningWords
        .filter((word) => word.zh !== listeningCurrent.zh)
        .map((word) => word.zh)
    )
  ];

  const options = shuffleListening([
    listeningCurrent.zh,
    ...shuffleListening(otherMeanings).slice(0, 2)
  ]);

  for (const meaning of options) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "choice";
    button.textContent = meaning;
    button.onclick = () => answerListening(button, meaning);

    $("#listeningChoices").append(button);
  }

  speakEnglish(listeningCurrent.en);
}

function answerListening(button, meaning) {
  if (!listeningCurrent || listeningAnswered) return;

  listeningAnswered = true;

  const isCorrect = meaning === listeningCurrent.zh;

  if (isCorrect) {
    listeningCorrectCount += 1;
  } else {
    button.classList.add("wrong");
  }

  document
    .querySelectorAll("#listeningChoices .choice")
    .forEach((choice) => {
      choice.disabled = true;

      if (choice.textContent === listeningCurrent.zh) {
        choice.classList.add("correct");
      }
    });

  $("#listeningResult").textContent =
    isCorrect ? "答對了！" : "再記一次，正確答案是：";

  $("#listeningAnswer").textContent =
    `${listeningCurrent.en}＝${listeningCurrent.zh}`;

  $("#listeningExample").textContent =
    listeningCurrent.example_ivan;

  $("#listeningFeedback").classList.add("show");
  $("#nextListening").classList.remove("hidden");
}

$("#startListening").onclick = beginListening;

$("#replayListening").onclick = () => {
  if (listeningCurrent) {
    speakEnglish(listeningCurrent.en);
  }
};

$("#nextListening").onclick = () => {
  if (!listeningAnswered) return;

  newListeningQuestion();
};

start();