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
  const modeNames = { classic: "Classic Timer", expert: "Memory Expert" };
  const modePicker = $("mode-picker");

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(millis).padStart(3,"0")}`;
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
    if (phase !== "ready") return;
    gameMode = mode;
    $("classic-mode-button").classList.toggle("is-selected", mode === "classic");
    $("expert-mode-button").classList.toggle("is-selected", mode === "expert");
    $("classic-mode-button").setAttribute("aria-pressed", String(mode === "classic"));
    $("expert-mode-button").setAttribute("aria-pressed", String(mode === "expert"));
    setPhase("READY WHEN YOU ARE", "—", mode === "classic" ? "Six tiles. Eight colours. How far can you go?" : "Ten rounds. Each round adds another tile.");
  }
  function updatePaletteDisabled(disabled) { paletteNode.querySelectorAll("button").forEach((button) => { button.disabled=disabled; }); }
  function setPhase(label, timer, hint) { $("round-label").textContent=label;$("phase-timer").textContent=timer;$("phase-hint").textContent=hint; }

  function startGame() {
    stopTick(); round=0; completedRounds=0; thinkingMs=0; thinkingStartedAt=0; $("result-card").hidden=true; $("game-title").closest(".game-card").hidden=false;
    renderPalette();setSettingsLocked(true);modePicker.hidden=true;$("start-button").hidden=true; $("continue-button").hidden=true; $("status-message").textContent=""; beginRound();
  }
  function beginRound() {
    round += 1; phase="memorize"; selectedCount=0; guesses=[];
    const sequenceLength = gameMode === "expert" ? round : 6;
    answer=Array.from({length:sequenceLength},()=>palette[Math.floor(Math.random()*palette.length)]);
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
    $("result-rounds").textContent=String(completedRounds);$("result-time").textContent=formatTime(thinkingMs);
    renderAnswerReview(reason);
    $("share-output").textContent=makeShareText();$("copy-button").textContent="Copy result ▣";
  }
  function renderAnswerReview(reason) {
    const answerNode=$("answer-tiles");const guessNode=$("guess-tiles");answerNode.replaceChildren();guessNode.replaceChildren();
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
  function makeShareText() {
    const marks=palette.map(i=>COLOURS[i].emoji);
    const blockCount=gameMode === "expert" ? completedRounds : 6;
    const blockRow=()=>Array.from({length:blockCount},()=>marks[Math.floor(Math.random()*marks.length)]).join("");
    const date=new Intl.DateTimeFormat(undefined,{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    return `${blockRow()}\nColourMap ${date}\nMode: ${modeNames[gameMode]}\nRounds Completed: ${completedRounds}\nThinking Time: ${formatTime(thinkingMs)}\n${blockRow()}`;
  }
  async function copyResult() {
    const text=$("share-output").textContent;
    try { await navigator.clipboard.writeText(text); }
    catch { const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.append(area);area.select();document.execCommand("copy");area.remove(); }
    $("copy-button").textContent="Copied ✓";
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

  $("start-button").addEventListener("click",startGame);
  $("classic-mode-button").addEventListener("click",()=>setMode("classic"));
  $("expert-mode-button").addEventListener("click",()=>setMode("expert"));
  $("continue-button").addEventListener("click",beginRound);
  $("replay-button").addEventListener("click",()=>{ $("result-card").hidden=true;$("game-title").closest(".game-card").hidden=false;renderPalette();setTilesBlank();tiles.forEach(tile=>tile.hidden=false);setPhase("READY WHEN YOU ARE","—",gameMode === "classic" ? "Six tiles. Eight colours. How far can you go?" : "Ten rounds. Each round adds another tile.");$("start-button").hidden=false;$("continue-button").hidden=true;modePicker.hidden=false;$("palette-label").textContent="COLOUR PALETTE";updatePaletteDisabled(false);phase="ready"; });
  $("copy-button").addEventListener("click",copyResult);
  const panel=$("settings-panel");const toggle=$("settings-toggle");
  toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));});
  $("settings-close").addEventListener("click",()=>{panel.hidden=true;toggle.setAttribute("aria-expanded","false");toggle.focus();});
  initSettings();renderPalette();setTilesBlank();
})();
