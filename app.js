const $ = (selector) => document.querySelector(selector);

let words = [];
let current;
let cloze;

const savedProgress = localStorage.getItem("vocabProgress");
const oldWeakWords = JSON.parse(localStorage.getItem("weakWords") || "{}");

let progress = savedProgress
  ? JSON.parse(savedProgress)
  : Object.fromEntries(
      Object.entries(oldWeakWords).map(([en, wrong]) => [en, { wrong, streak: 0 }])
    );

const shuffle = (array) => [...array].sort(() => Math.random() - 0.5);

function getProgress(en) {
  if (!progress[en]) {
    progress[en] = { wrong: 0, streak: 0 };
  }

  return progress[en];
}

function getWeight(word) {
  const record = progress[word.en];

  if (!record) return 3;

  if (record.wrong > 0) {
    return 8 + Math.min(record.wrong, 3) * 2;
  }

  if (record.streak >= 3) return 0.25;
  if (record.streak === 2) return 0.75;
  if (record.streak === 1) return 1.5;

  return 3;
}

function pickWord() {
  const totalWeight = words.reduce(
    (total, word) => total + getWeight(word),
    0
  );

  let point = Math.random() * totalWeight;

  for (const word of words) {
    point -= getWeight(word);

    if (point <= 0) {
      return word;
    }
  }

  return words[words.length - 1];
}

function saveProgress() {
  localStorage.setItem("vocabProgress", JSON.stringify(progress));
  renderWeakCount();
}

function markCorrect(en) {
  const record = getProgress(en);

  record.streak += 1;
  record.wrong = Math.max(0, record.wrong - 1);

  saveProgress();
}

function markWrong(en) {
  const record = getProgress(en);

  record.wrong += 1;
  record.streak = 0;

  saveProgress();
}

function renderWeakCount() {
  const count = Object.values(progress).filter(
    (record) => record.wrong > 0
  ).length;

  $("#weakCount").textContent = count;
}

async function start() {
  try {
    words = await fetch("./vocabulary.json").then((response) =>
      response.json()
    );

    renderWeakCount();
    newTranslate();
  } catch {
    $("#translate").innerHTML =
      "<p>找不到 vocabulary.json，請確認它和 index.html 放在同一個資料夾。</p>";
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

  $("#example").innerHTML = `
    <b>簡單例句</b><br>
    ${current.example}
  `;

  $("#example").classList.add("show");
  $("#know").classList.add("hidden");
  $("#review").classList.add("hidden");
  $("#nextAfterReview").classList.remove("hidden");
}

function newCloze() {
  cloze = pickWord();

  const options = shuffle([
    cloze,
    ...shuffle(words.filter((word) => word.en !== cloze.en)).slice(0, 3)
  ]);

  $("#clozeTitle").textContent = `「${cloze.zh}」`;
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

  document.querySelectorAll(".choice").forEach((item) => {
    item.disabled = true;
  });

  const isCorrect = selectedWord.en === cloze.en;

  button.classList.add(isCorrect ? "correct" : "wrong");

  if (isCorrect) {
    markCorrect(cloze.en);
    $("#clozeNote").textContent = `答對了！${cloze.example}`;
  } else {
    markWrong(cloze.en);

    [...document.querySelectorAll(".choice")]
      .find((item) => item.textContent === cloze.en)
      .classList.add("correct");

    $("#clozeNote").innerHTML = `
      正確答案是 <b>${cloze.en}</b>。例句：${cloze.example}
    `;
  }

  $("#nextCloze").classList.remove("hidden");
}

function renderLibrary() {
  const list = $("#libraryList");

  const items = words.filter(
    (word) => progress[word.en]?.wrong > 0
  );

  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = '<div class="empty">目前沒有待複習單字。</div>';
    return;
  }

  items
    .sort((a, b) => progress[b.en].wrong - progress[a.en].wrong)
    .forEach((word) => {
      const row = document.createElement("div");

      row.className = "library-row";
      row.innerHTML = `
        <div>
          <b>${word.en}</b>
          <div class="small">${word.zh}</div>
        </div>
        <span class="badge">答錯 ${progress[word.en].wrong} 次</span>
      `;

      list.append(row);
    });
}

document.querySelectorAll(".tab[data-view]").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab[data-view]").forEach((item) => {
      item.classList.toggle("active", item === tab);
    });

    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("hidden", view.id !== tab.dataset.view);
    });

    if (tab.dataset.view === "library") {
      renderLibrary();
    }

    if (tab.dataset.view === "cloze") {
      newCloze();
    }
  };
});

$("#check").onclick = showAnswer;

$("#meaning").onkeydown = (event) => {
  if (event.key === "Enter") {
    showAnswer();
  }
};

$("#know").onclick = () => gradeTranslate(true);
$("#review").onclick = () => gradeTranslate(false);
$("#nextAfterReview").onclick = newTranslate;
$("#nextCloze").onclick = newCloze;

$("#clearWeak").onclick = () => {
  if (confirm("確定清空待複習紀錄？")) {
    progress = {};

    localStorage.removeItem("weakWords");
    saveProgress();
    renderLibrary();
  }
};

start();