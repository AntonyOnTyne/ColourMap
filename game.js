(() => {
  const COLOURS = [
    { name: "Red", hex: "#C7473A", emoji: "🟥" }, { name: "Blue", hex: "#3568A8", emoji: "🟦" },
    { name: "Green", hex: "#25845D", emoji: "🟩" }, { name: "Yellow", hex: "#E2B832", emoji: "🟨" },
    { name: "Purple", hex: "#7953A6", emoji: "🟪" }, { name: "Cyan", hex: "#45AEB4", emoji: "🟦" },
    { name: "Light Grey", hex: "#CFD3D2", emoji: "⬜" }, { name: "Dark Grey", hex: "#555C60", emoji: "⬛" },
    { name: "Coral", hex: "#E77D62", emoji: "🟥" }, { name: "Navy", hex: "#35466F", emoji: "🟦" },
    { name: "Teal", hex: "#267C78", emoji: "🟩" }, { name: "Lime", hex: "#A7B83F", emoji: "🟩" },
    { name: "Amber", hex: "#D89032", emoji: "🟨" }, { name: "Magenta", hex: "#B34D82", emoji: "🟪" },
    { name: "Lavender", hex: "#A695C9", emoji: "🟪" }, { name: "Slate", hex: "#77858B", emoji: "⬛" },
    { name: "Rose", hex: "#D88791", emoji: "🟥" }, { name: "Forest", hex: "#376B4D", emoji: "🟩" },
    { name: "Sky", hex: "#77B5D2", emoji: "🟦" }, { name: "Sand", hex: "#C5AA73", emoji: "🟨" }
  ];
  const PRESETS = {
    "Classic": [0,1,2,3,4,5,6,7],
    "High contrast": [0,1,2,3,4,7,9,16],
    "Soft spectrum": [8,18,10,3,14,13,6,15]
  };
  const ROUND_SECONDS = [10,9,8,7,6,5,4,3,2,1];
  const DAILY_CLASSIC_SEED = 13041969;
  const DAILY_EXPERT_SEED = 15061965;
  const MAX_DAILY_ATTEMPTS = 10;
  const STORAGE_KEY = "colourmap.stats.v1";
  const ATTEMPT_LOCK = "colourmap.daily-attempt";
  const MODE_KEYS = ["classic", "expert"];
  const $ = (id) => document.getElementById(id);
  const tiles = [...document.querySelectorAll(".sequence-tile")];
  const paletteNode = $("palette");
  let palette = PRESETS.Classic.slice();
  let answer = [];
  let round = 0;
  let completedRounds = 0;
  let thinkingMs = 0;
  let thinkingStartedAt = 0;
  let phase = "ready";
  let tickHandle = null;
  let selectedCount = 0;
  let guesses = [];
  let finishedReason = "mistake";
  let gameMode = "classic";
  let gameStartDate = "";
  let classicNumbers = [];
  let expertNumbers = [];
  let gameAttemptIndex = 0;
  let gameDailySnapshot = null;
  let startPending = false;
  const statsChannel = "BroadcastChannel" in window ? new BroadcastChannel("colourmap.stats.v1") : null;
  const modeNames = { classic: "Classic Timer", expert: "Memory Expert" };
  const modePicker = $("mode-picker");

  function formatTime(ms) {
    const total = Math.max(0, Math.round(ms));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(millis).padStart(3,"0")}`;
  }
  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
  function generateNumbers(seed, dateKey = localDateKey()) {
    const date = BigInt(dateKey.replaceAll("-", ""));
    const seedValue = BigInt(seed);
    let value = seedValue * date + seedValue;
    const results = [];
    const multiplier = 1103515245n;
    const increment = 12345n;
    const modulus = 2147483648n;

    for (let attempt = 0; attempt < 10; attempt++) {
      const rounds = [];
      for (let round = 0; round < 10; round++) {
        value = (value * multiplier + increment) % modulus;
        rounds.push(value.toString(8).slice(-6).padStart(6, "0"));
      }
      results.push(rounds);
    }

    return results;
  }
  function generateMemoryExpertNumbers(seed, dateKey = localDateKey()) {
    const date = BigInt(dateKey.replaceAll("-", ""));
    const seedValue = BigInt(seed);
    if (seedValue < 0n) throw new Error("Seed must be a non-negative integer");
    let value = seedValue * date + seedValue;
    const results = [];
    const multiplier = 1103515245n;
    const increment = 12345n;
    const modulus = 2147483648n;

    for (let attempt = 0; attempt < 10; attempt++) {
      const rounds = [];
      for (let length = 1; length <= 10; length++) {
        value = (value * multiplier + increment) % modulus;
        rounds.push(value.toString(8).slice(-length).padStart(length, "0"));
      }
      results.push(rounds);
    }

    return results;
  }
  function previousDate(dateKey) {
    const [year,month,day] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month-1, day-1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
  }
  function displayDate(dateKey) {
    const [year,month,day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { day:"2-digit", month:"short", year:"numeric" }).format(new Date(year, month-1, day, 12));
  }
  function displayShareDate(dateKey) {
    const [year,month,day] = dateKey.split("-").map(Number);
    const monthName = new Intl.DateTimeFormat("en-GB", { month:"short" }).format(new Date(year, month-1, 1));
    return `${String(day).padStart(2,"0")}-${monthName}-${String(year).padStart(4,"0")}`;
  }
  function emptyModeStats() { return { lastPlayedDate:null, streak:0, daily:{ date:null, attempts:0, best:null }, bestEver:null, completedGames:0 }; }
  function emptyStats() { return { version:1, modes:{ classic:emptyModeStats(), expert:emptyModeStats() } }; }
  function normalizeScore(score) {
    if (!score || !Number.isFinite(score.rounds) || !Number.isFinite(score.thinkingMs) || typeof score.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(score.date)) return null;
    return { rounds:Math.max(0, Math.floor(score.rounds)), thinkingMs:Math.max(0, Math.round(score.thinkingMs)), date:score.date };
  }
  function loadStats() {
    const fallback = emptyStats();
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!stored || stored.version !== 1 || !stored.modes) return fallback;
      let migrated = false;
      MODE_KEYS.forEach((mode) => {
        const source = stored.modes[mode] || {};
        const target = fallback.modes[mode];
        target.lastPlayedDate = typeof source.lastPlayedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.lastPlayedDate) ? source.lastPlayedDate : null;
        target.streak = Number.isFinite(source.streak) ? Math.max(0, Math.floor(source.streak)) : 0;
        target.bestEver = normalizeScore(source.bestEver);
        target.completedGames = Number.isFinite(source.completedGames) ? Math.max(0, Math.floor(source.completedGames)) : 0;
        if (!Number.isFinite(source.completedGames)) migrated = true;
        if (source.daily && typeof source.daily.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.daily.date)) {
          target.daily = {
            date:source.daily.date,
            attempts:Number.isFinite(source.daily.attempts) ? Math.max(0, Math.floor(source.daily.attempts)) : 0,
            best:normalizeScore(source.daily.best)
          };
        }
      });
      if (migrated) saveStats(fallback);
      return fallback;
    } catch { return fallback; }
  }
  function saveStats(stats) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch { /* Keep the game playable when storage is unavailable. */ }
  }
  function ensureDailyRecord(modeStats, dateKey) {
    if (modeStats.daily.date !== dateKey) modeStats.daily = { date:dateKey, attempts:0, best:null };
  }
  function recordGameStart(mode, dateKey) {
    const stats = loadStats();
    const modeStats = stats.modes[mode];
    ensureDailyRecord(modeStats, dateKey);
    if (modeStats.daily.attempts >= MAX_DAILY_ATTEMPTS) return null;
    modeStats.daily.attempts += 1;
    if (modeStats.lastPlayedDate !== dateKey) {
      modeStats.streak = modeStats.lastPlayedDate === previousDate(dateKey) ? modeStats.streak + 1 : 1;
      modeStats.lastPlayedDate = dateKey;
    }
    saveStats(stats);
    if (statsChannel) statsChannel.postMessage({ type:"attempt-updated" });
    return modeStats.daily.attempts;
  }
  async function claimGameAttempt(mode,dateKey) {
    if (navigator.locks && typeof navigator.locks.request === "function") {
      return navigator.locks.request(ATTEMPT_LOCK,()=>recordGameStart(mode,dateKey));
    }
    return recordGameStart(mode,dateKey);
  }
  function scoreIsBetter(candidate, current) {
    return !current || candidate.rounds > current.rounds || (candidate.rounds === current.rounds && candidate.thinkingMs < current.thinkingMs);
  }
  function recordFinishedGame(score) {
    const stats = loadStats();
    const modeStats = stats.modes[gameMode];
    const sameDay=modeStats.daily.date===gameStartDate;
    const resultDaily=sameDay?modeStats.daily:(gameDailySnapshot?.daily||{date:gameStartDate,attempts:1,best:null});
    if (scoreIsBetter(score, resultDaily.best)) resultDaily.best = score;
    if(sameDay)modeStats.daily=resultDaily;
    if (scoreIsBetter(score, modeStats.bestEver)) modeStats.bestEver = score;
    if (finishedReason === "win") modeStats.completedGames += 1;
    saveStats(stats);
    return {...modeStats,streak:sameDay?modeStats.streak:(gameDailySnapshot?.streak??modeStats.streak),daily:resultDaily};
  }
  function stopTick() { if (tickHandle !== null) { cancelAnimationFrame(tickHandle); clearInterval(tickHandle); tickHandle = null; } }
  function shuffledIndices() {
    const values = palette.slice();
    for (let i=values.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [values[i],values[j]]=[values[j],values[i]]; }
    return values;
  }
  function renderPalette() {
    paletteNode.replaceChildren();
    palette.forEach((colourIndex) => {
      const colour = COLOURS[colourIndex];
      const button = document.createElement("button");
      button.type="button"; button.className="colour-button"; button.style.backgroundColor=colour.hex;
      button.setAttribute("aria-label", colour.name);
      button.addEventListener("click", () => chooseColour(colourIndex)); paletteNode.append(button);
    });
  }
  function setTilesBlank() { tiles.forEach((tile) => { tile.style.backgroundColor="";tile.classList.remove("filled","wrong","correct");tile.setAttribute("aria-label","Empty tile"); }); }
  function setMode(mode) {
    if (phase !== "ready" || startPending || $(`${mode}-mode-button`).disabled) return;
    gameMode = mode;
    refreshDailyState();
  }
  function refreshDailyState() {
    const stats=loadStats();
    const today=localDateKey();
    let changed=false;
    MODE_KEYS.forEach((mode)=>{
      if(stats.modes[mode].daily.date!==today){stats.modes[mode].daily={date:today,attempts:0,best:null};changed=true;}
    });
    if(changed)saveStats(stats);
    const available=MODE_KEYS.filter((mode)=>stats.modes[mode].daily.attempts<MAX_DAILY_ATTEMPTS);
    MODE_KEYS.forEach((mode)=>{$(`${mode}-mode-button`).disabled=!available.includes(mode);});
    if(phase==="ready"&&available.length&& !available.includes(gameMode))gameMode=available[0];
    MODE_KEYS.forEach((mode)=>{
      const selected=available.length>0&&gameMode===mode;
      $(`${mode}-mode-button`).classList.toggle("is-selected",selected);
      $(`${mode}-mode-button`).setAttribute("aria-pressed",String(selected));
    });
    const modeStats=stats.modes[gameMode];
    const attempts=modeStats.daily.attempts;
    $("mode-attempts").textContent=`${modeNames[gameMode]} attempts today: ${attempts}, ${Math.max(0,MAX_DAILY_ATTEMPTS-attempts)} left.`;
    const noModesAvailable=available.length===0;
    $("limit-message").hidden=!noModesAvailable;
    $("limit-message").textContent="Both game modes have reached today’s 10-attempt limit.\nPlease come back tomorrow.";
    $("start-button").disabled=noModesAvailable||startPending;
    if(phase==="ready")setPhase("READY WHEN YOU ARE","—",gameMode==="classic"?"Six tiles. Eight colours. How far can you go?":"Ten rounds. Each round adds another tile.");
    return stats;
  }
  function updatePaletteDisabled(disabled) { paletteNode.querySelectorAll("button").forEach((button) => { button.disabled=disabled; }); }
  function setPhase(label, timer, hint) { $("round-label").textContent=label;$("phase-timer").textContent=timer;$("phase-hint").textContent=hint; }

  async function startGame() {
    if(phase!=="ready"||startPending)return;
    startPending=true;phase="starting";$("start-button").disabled=true;
    const dateKey=localDateKey();
    let attemptNumber=null;
    try { attemptNumber=await claimGameAttempt(gameMode,dateKey); }
    catch { attemptNumber=recordGameStart(gameMode,dateKey); }
    if(!attemptNumber){phase="ready";startPending=false;refreshDailyState();return;}
    gameStartDate=dateKey;
    gameAttemptIndex=attemptNumber-1;
    classicNumbers=generateNumbers(DAILY_CLASSIC_SEED,gameStartDate);
    expertNumbers=generateMemoryExpertNumbers(DAILY_EXPERT_SEED,gameStartDate);
    const startStats=loadStats().modes[gameMode];
    gameDailySnapshot={streak:startStats.streak,daily:{...startStats.daily,best:startStats.daily.best?{...startStats.daily.best}:null}};
    startPending=false;
    stopTick(); round=0; completedRounds=0; thinkingMs=0; thinkingStartedAt=0; $("result-card").hidden=true; $("game-title").closest(".game-card").hidden=false;
    renderPalette();setSettingsLocked(true);modePicker.hidden=true;$("mode-attempts").hidden=true;$("limit-message").hidden=true;$("start-button").hidden=true; $("continue-button").hidden=true; $("status-message").textContent=""; beginRound();
  }
  function beginRound() {
    round += 1; phase="memorize"; selectedCount=0; guesses=[];
    const sequenceLength = gameMode === "expert" ? round : 6;
    answer=gameMode === "classic"
      ? Array.from(classicNumbers[gameAttemptIndex][round-1],(digit)=>palette[Number(digit)])
      : Array.from(expertNumbers[gameAttemptIndex][round-1],(digit)=>palette[Number(digit)]);
    updatePaletteDisabled(true); $("palette-label").textContent="COLOUR PALETTE"; $("continue-button").hidden=true; $("status-message").textContent="";
    tiles.forEach((tile,index)=>{tile.hidden=index>=sequenceLength;tile.style.backgroundColor="";tile.classList.remove("filled","wrong","correct");if(index<sequenceLength){tile.style.backgroundColor=COLOURS[answer[index]].hex;tile.classList.add("filled");tile.setAttribute("aria-label",`Sequence tile ${index+1}`);}});
    $("sequence").style.setProperty("--tile-count", sequenceLength);
    $("sequence").setAttribute("aria-label",`${sequenceLength} tile sequence`);
    const duration=(gameMode === "expert" ? 5 : ROUND_SECONDS[round-1])*1000; const end=performance.now()+duration;
    setPhase(`ROUND ${round} OF 10`,"", "Memorize the colours and their order.");
    stopTick();
    const update=()=>{const remaining=Math.max(0,end-performance.now());$("phase-timer").textContent=`${(remaining/1000).toFixed(3)} s`;if(remaining<=0){stopTick();startPlayPhase();}};
    update(); tickHandle=setInterval(update,16);
  }
  function startPlayPhase() {
    phase="playing";setTilesBlank();updatePaletteDisabled(false);thinkingStartedAt=performance.now();
    setPhase(`ROUND ${round} OF 10`,formatTime(thinkingMs),`Choose the ${answer.length} ${answer.length === 1 ? "colour" : "colours"} in order. Each choice is final.`);
    stopTick();tickHandle=setInterval(()=>{$("phase-timer").textContent=formatTime(thinkingMs+performance.now()-thinkingStartedAt);},16);
  }
  function chooseColour(colourIndex) {
    if(phase!=="playing" || selectedCount>=answer.length) return;
    const slot=selectedCount;const tile=tiles[slot];selectedCount++;
    guesses.push(colourIndex);
    tile.style.backgroundColor=COLOURS[colourIndex].hex;tile.classList.add("filled");tile.setAttribute("aria-label",`${COLOURS[colourIndex].name}, tile ${slot+1}`);
    if(colourIndex!==answer[slot]) { tile.classList.add("wrong"); finishGame("mistake"); return; }
    tile.classList.add("correct");
    if(selectedCount===answer.length) { completedRounds=round;thinkingMs+=performance.now()-thinkingStartedAt;thinkingStartedAt=0;stopTick();if(round===10)finishGame("win");else prepareNextRound(); }
  }
  function prepareNextRound() {
    phase="between";updatePaletteDisabled(true);setPhase(`ROUND ${round} COMPLETE`,formatTime(thinkingMs),"Your thinking time is paused.");$("phase-hint").textContent="Take a breath, then continue when you’re ready.";$("continue-button").hidden=false;$("status-message").textContent="";
  }
  function finishGame(reason) {
    if(phase==="ended") return;
    if(phase==="playing" && thinkingStartedAt) thinkingMs+=performance.now()-thinkingStartedAt;
    stopTick();phase="ended";finishedReason=reason;updatePaletteDisabled(true);setSettingsLocked(false);$("game-title").closest(".game-card").hidden=true;
    const result=$("result-card");result.hidden=false;
    $("result-mode").textContent=modeNames[gameMode];
    $("result-kicker").textContent=reason==="win"?"PERFECT MEMORY":"GAME OVER";
    $("result-title").textContent=reason==="win"?"You mapped every colour.":"That was a close one.";
    const score={rounds:completedRounds,thinkingMs:Math.max(0,Math.round(thinkingMs)),date:gameStartDate};
    const modeStats=recordFinishedGame(score);
    renderAnswerReview(reason);
    renderResultSummaries(score,modeStats);
  }
  function renderAnswerReview(reason) {
    const answerNode=$("answer-tiles");const guessNode=$("guess-tiles");answerNode.replaceChildren();guessNode.replaceChildren();
    answerNode.classList.toggle("expert-review",gameMode === "expert");
    guessNode.classList.toggle("expert-review",gameMode === "expert");
    answerNode.closest(".answer-review").classList.toggle("expert-review",gameMode === "expert");
    answer.forEach((colourIndex,index)=>{
      const target=document.createElement("span");target.className="review-tile is-colour";target.style.backgroundColor=COLOURS[colourIndex].hex;target.setAttribute("aria-label",`Correct tile ${index+1}: ${COLOURS[colourIndex].name}`);answerNode.append(target);
      const picked=guesses[index];const guess=document.createElement("span");guess.className="review-tile";
      if(picked!==undefined){guess.classList.add("is-colour");guess.style.backgroundColor=COLOURS[picked].hex;guess.setAttribute("aria-label",`Your pick ${index+1}: ${COLOURS[picked].name}${picked!==colourIndex?", incorrect":", correct"}`);}
      else guess.setAttribute("aria-label",`No pick for tile ${index+1}`);
      if(picked!==undefined && picked!==colourIndex) guess.classList.add("is-wrong");
      guessNode.append(guess);
    });
    $("answer-tiles").style.setProperty("--review-count", answer.length);
    $("guess-tiles").style.setProperty("--review-count", answer.length);
    $("review-note").textContent=reason==="mistake"?"The × marks the incorrect pick that ended the game.":`All ${answer.length} picks matched the pattern.`;
  }
  function makeShareText(score,label) {
    const marks=palette.map(i=>COLOURS[i].emoji);
    const blockRow=()=>Array.from({length:6},()=>marks[Math.floor(Math.random()*marks.length)]).join("");
    return `${blockRow()}\nColourMap\n${modeNames[gameMode]}\n${label}\n${displayShareDate(score.date)}\nRounds ${score.rounds}\nTime ${formatTime(score.thinkingMs)}\n${blockRow()}`;
  }
  function renderResultSummaries(currentScore,modeStats) {
    const bestToday=modeStats.daily.best || currentScore;
    const bestEver=modeStats.bestEver || currentScore;
    const summaries=[
      {prefix:"current",score:currentScore,label:"Last Go"},
      {prefix:"today",score:bestToday,label:"Best Today"},
      {prefix:"ever",score:bestEver,label:"Best Ever"}
    ];
    summaries.forEach(({prefix,score,label})=>{
      $(`${prefix}-result-date`).textContent=displayDate(score.date);
      $(`${prefix}-result-rounds`).textContent=`${score.rounds} rounds`;
      $(`${prefix}-result-time`).textContent=formatTime(score.thinkingMs);
      $(`${prefix}-share-output`).textContent=makeShareText(score,label);
      $(`copy-${prefix}-button`).textContent=prefix==="current"?"Copy this result":prefix==="today"?"Copy today’s best":"Copy best ever";
    });
    const attempts=modeStats.daily.attempts;
    $("result-attempts").textContent=`${modeNames[gameMode]} attempts today: ${attempts}, ${Math.max(0,MAX_DAILY_ATTEMPTS-attempts)} left.`;
    $("result-streak").textContent=`${modeNames[gameMode]} daily streak: ${modeStats.streak}`;
    $("result-completions").textContent=`${modeNames[gameMode]} fully completed: ${modeStats.completedGames}`;
  }
  async function copyResult(outputId,buttonId) {
    const text=$(outputId).textContent;
    try { await navigator.clipboard.writeText(text); }
    catch { const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.append(area);area.select();document.execCommand("copy");area.remove(); }
    $(buttonId).textContent="Copied ✓";
  }

  function initSettings() {
    const presetSelect=$("palette-preset");
    Object.keys(PRESETS).forEach((name)=>{const option=document.createElement("option");option.value=name;option.textContent=name;presetSelect.append(option);});
    const grid=$("colour-picker-grid");
    for(let slot=0;slot<8;slot++) {
      const wrapper=document.createElement("label");wrapper.className="colour-choice";wrapper.append(Object.assign(document.createElement("span"),{className:"choice-swatch"}));
      const select=document.createElement("select");select.setAttribute("aria-label",`Colour for palette position ${slot+1}`);select.dataset.slot=String(slot);
      COLOURS.forEach((colour,index)=>{const option=document.createElement("option");option.value=String(index);option.textContent=colour.name;select.append(option);});
      select.addEventListener("change",()=>{const target=Number(select.value);const duplicate=palette.findIndex((value,index)=>value===target&&index!==slot);if(duplicate!==-1){select.value=String(palette[slot]);return;}palette[slot]=target;wrapper.querySelector(".choice-swatch").style.backgroundColor=COLOURS[target].hex;presetSelect.value="custom";});
      wrapper.append(select);grid.append(wrapper);
    }
    function syncSettings() { [...grid.querySelectorAll("select")].forEach((select,slot)=>{select.value=String(palette[slot]);select.previousElementSibling.style.backgroundColor=COLOURS[palette[slot]].hex;}); }
    presetSelect.addEventListener("change",()=>{if(PRESETS[presetSelect.value]){palette=PRESETS[presetSelect.value].slice();renderPalette();syncSettings();}});
    // Custom option represents any manually edited combination.
    const custom=new Option("Custom palette","custom");presetSelect.append(custom);
    syncSettings();
  }
  function setSettingsLocked(locked) {
    $("palette-preset").disabled=locked;
    $("colour-picker-grid").querySelectorAll("select").forEach((select)=>{select.disabled=locked;});
    if(locked && !$("settings-panel").hidden){$("settings-panel").hidden=true;$("settings-toggle").setAttribute("aria-expanded","false");}
  }

  function scheduleMidnightRefresh() {
    const now=new Date();
    const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,100);
    setTimeout(()=>{
      refreshDailyState();
      scheduleMidnightRefresh();
    },Math.max(1,midnight-now));
  }

  $("start-button").addEventListener("click",startGame);
  $("classic-mode-button").addEventListener("click",()=>setMode("classic"));
  $("expert-mode-button").addEventListener("click",()=>setMode("expert"));
  $("continue-button").addEventListener("click",beginRound);
  $("replay-button").addEventListener("click",()=>{ $("result-card").hidden=true;$("game-title").closest(".game-card").hidden=false;renderPalette();setTilesBlank();tiles.forEach((tile,index)=>tile.hidden=index>=6);$("sequence").style.setProperty("--tile-count",6);$("sequence").setAttribute("aria-label","6 tile sequence");$("start-button").hidden=false;$("continue-button").hidden=true;modePicker.hidden=false;$("mode-attempts").hidden=false;$("limit-message").hidden=false;$("palette-label").textContent="COLOUR PALETTE";updatePaletteDisabled(false);phase="ready";refreshDailyState(); });
  $("copy-current-button").addEventListener("click",()=>copyResult("current-share-output","copy-current-button"));
  $("copy-today-button").addEventListener("click",()=>copyResult("today-share-output","copy-today-button"));
  $("copy-ever-button").addEventListener("click",()=>copyResult("ever-share-output","copy-ever-button"));
  const panel=$("settings-panel");const toggle=$("settings-toggle");
  toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));});
  $("settings-close").addEventListener("click",()=>{panel.hidden=true;toggle.setAttribute("aria-expanded","false");toggle.focus();});
  window.addEventListener("storage",(event)=>{if((event.key===STORAGE_KEY||event.key===null)&&phase==="ready")refreshDailyState();});
  if(statsChannel)statsChannel.addEventListener("message",()=>{if(phase==="ready")refreshDailyState();});
  initSettings();renderPalette();setTilesBlank();tiles.forEach((tile,index)=>{tile.hidden=index>=6;});refreshDailyState();scheduleMidnightRefresh();
})();
