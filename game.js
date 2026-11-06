"use strict";

const levels = [
  {
    title: "马厩困境", area: "皇家马厩", region: "stable", map: [12, 69], coins: 120,
    clue: "火挡住了去路。观察水槽下方的金针。",
    pins: [["water", 53], ["gate", 25]], goals: ["water"],
  },
  {
    title: "峡谷陷坑", area: "峡谷遗迹", region: "canyon", map: [31, 57], coins: 180,
    clue: "草料从上方落下，能把尖刺垫成一段平路。",
    pins: [["hay", 53], ["gate", 25]], goals: ["hay"],
  },
  {
    title: "幽狼暗道", area: "地下通道", region: "tunnel", map: [49, 72], coins: 260,
    clue: "草料会压下侧笼踏板。等狼进笼，再放下笼门。",
    pins: [["bait", 38], ["cage", 48], ["gate", 25]], goals: ["cage"],
  },
  {
    title: "熔岩马道", area: "竞技场地窟", region: "arena", map: [67, 57], coins: 360,
    clue: "高温会点燃草料。先降温，再铺过陷坑的路。",
    pins: [["water", 65], ["hay", 43], ["gate", 25]], goals: ["water", "hay"],
  },
  {
    title: "王冠赛道", area: "古代竞技场", region: "arena", map: [86, 41], coins: 580,
    clue: "引水灭火。等狼进侧笼，落下笼门后再释放滚石。",
    pins: [["water", 55], ["bait", 32], ["cage", 42], ["rock", 72], ["gate", 24]],
    goals: ["water", "cage", "rock"],
  },
];

const info = {
  water: { name: "水槽", image: "water", goal: "扑灭火焰", hint: "拔出水槽下方的横针，引水灭火。" },
  hay: { name: "草料槽", image: "hay", goal: "覆盖尖刺", hint: "拔出草料下方的横针，盖住尖刺。" },
  bait: { name: "草料踏板", image: "hay", hint: "放下草料压动机关，把狼引进侧笼。" },
  cage: { name: "狼笼门", image: "wolf", goal: "关住灰狼", hint: "拔出侧笼旁的竖针，关住已经进笼的狼。" },
  rock: { name: "滚石槽", image: "rock", goal: "填平陷坑", hint: "狼已关住。松开滚石，让它落进陷坑。" },
  gate: { name: "马厩门", image: "horse", hint: "前路已清，拔出赛马右侧的竖针。" },
};

const $ = (id) => document.getElementById(id);
const asset = (name) => "assets/" + name + ".png";
const storageKey = "horse-pin-rescue-v1";
const format = new Intl.NumberFormat("zh-CN");
const ground = 85;
const upper = 41.5;
let progress = {};
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  for (const [i, level] of levels.entries()) {
    if (saved && saved[i] === level.pins.length) progress[i] = saved[i];
  }
} catch {}

function unlocked() {
  return Math.min(levels.length - 1, Object.keys(progress).length);
}

let current = unlocked();
let state;
let items;
let pinButtons;
let audioContext;
let muted = true;

function sound(type) {
  if (muted) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
    const notes = {
      pull: [440, 620], water: [510, 440, 330], drop: [190, 110],
      fail: [235, 180, 115], win: [392, 494, 587, 784],
    };
    for (const [i, frequency] of notes[type].entries()) {
      const tone = audioContext.createOscillator();
      const volume = audioContext.createGain();
      const start = audioContext.currentTime + i * .085;
      tone.type = type === "fail" ? "triangle" : "sine";
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(.1, start);
      volume.gain.exponentialRampToValueAtTime(.001, start + .16);
      tone.connect(volume).connect(audioContext.destination);
      tone.start(start);
      tone.stop(start + .17);
    }
  } catch {}
}

function icon(name) {
  const image = document.createElement("img");
  image.src = asset(name);
  image.alt = "";
  image.draggable = false;
  return image;
}

function sprite(parent, name, x, y, w, h, extra = "") {
  const el = icon(name);
  el.className = "sprite " + extra;
  el.style.setProperty("--w", w + "%");
  el.style.setProperty("--h", h + "%");
  position(el, x, y);
  $(parent).append(el);
  return el;
}

function position(el, x, y) {
  el.style.setProperty("--x", x + "%");
  el.style.setProperty("--y", y + "%");
}

function recess(x, y, w, h) {
  const panel = document.createElement("div");
  panel.className = "recess";
  Object.assign(panel.style, { left: x + "%", top: y + "%", width: w + "%", height: h + "%" });
  $("scenery").append(panel);
}

function tag(label, x, y) {
  const el = document.createElement("b");
  el.className = "cell-tag";
  el.textContent = label;
  Object.assign(el.style, { left: x + "%", top: y + "%" });
  $("scenery").append(el);
}

function addPin(id, x) {
  const vertical = id === "gate" || id === "cage";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pin" + (vertical ? " vertical" : "");
  btn.setAttribute("aria-label", "拔出" + info[id].name + "的机关针");
  btn.title = info[id].name;
  position(btn, x, id === "gate" ? 70 : id === "cage" ? 61 : 44);
  btn.style.setProperty("--w", vertical ? "7.6%" : "17%");
  btn.style.setProperty("--h", id === "gate" ? "31%" : id === "cage" ? "23%" : "10%");
  btn.style.setProperty("--length", id === "gate" ? "186%" : "141%");
  btn.append(icon("pin"));
  btn.addEventListener("click", () => pull(id));
  $("pins").append(btn);
  pinButtons[id] = btn;
}

function status(message, tone = "") {
  $("status").textContent = message;
  $("status").dataset.tone = tone;
}

function hud() {
  const level = levels[current];
  const goals = [
    ["horse", "救出赛马", state.outcome === "win"],
    ["chest", "收集宝箱", state.outcome === "win"],
    ...level.goals.map((id) => [info[id].image, info[id].goal, state.done.has(id)]),
  ];
  $("goals").replaceChildren(...goals.map(([image, title, done]) => {
    const li = document.createElement("li");
    li.classList.toggle("done", done);
    li.append(icon(image), document.createTextNode(title + (done ? " ✓" : "")));
    return li;
  }));
  $("steps").textContent = state.steps + " / " + level.pins.length;
  $("segments").replaceChildren(...level.pins.map((_, i) => {
    const el = document.createElement("i");
    el.classList.toggle("used", i < state.steps);
    return el;
  }));
  $("coins").textContent = format.format(levels.reduce((sum, level, i) => sum + (progress[i] ? level.coins : 0), 0));
}

function reset(index = current) {
  current = index;
  const level = levels[current];
  state = { done: new Set(), steps: 0, busy: false, outcome: "" };
  items = {};
  pinButtons = {};
  $("map-dialog").close();
  $("result").close();
  $("board").dataset.region = level.region;
  $("board").classList.remove("failed", "shake");
  for (const id of ["scenery", "actors", "pins", "effects"]) $(id).replaceChildren();
  $("chapter").textContent = "第 " + String(current + 1).padStart(2, "0") + " / 05 关";
  $("level-title").textContent = level.title;
  $("zone").textContent = level.area;
  $("clue").textContent = level.clue;

  recess(4, 48, 94, 37.5);
  sprite("scenery", "pillar", 4, 88, 4.7, 79, "fill");
  sprite("scenery", "pillar", 96, 88, 4.7, 79, "fill");
  sprite("scenery", "banner", 14, 45, 13, 34);
  sprite("scenery", "banner", 86, 40, 10, 27);
  for (const x of [19, 50, 81]) sprite("scenery", "stone", x, 93, 32, 8.5, "fill");
  sprite("scenery", "portal", 90, ground, 13.8, 35, "portal");

  for (const [id, x] of level.pins) {
    if (id === "gate") {
      items.gate = sprite("actors", "bars", x - 1.9, ground, 6.5, 31, "gate-bars fill");
    } else if (id === "cage") {
      recess(x - 14, 47, 13, 21);
      sprite("scenery", "stone", x - 7.3, 69, 14.5, 4, "fill");
      items.cage = sprite("actors", "bars", x - 6.9, 65.5, 9.5, 17.5, "gate-bars open fill");
      items.wolf = sprite("actors", "wolf", x + 6.5, ground, 14, 19);
      tag("侧笼", x - 7, 47.1);
    } else {
      const bayWidth = level.pins.length > 4 ? 16.2 : 19.2;
      recess(x - bayWidth / 2, 16, bayWidth, 27);
      sprite("scenery", "stone", x, 17, bayWidth + 2, 5, "fill");
      sprite("scenery", "pillar", x - bayWidth / 2, 44, 2.8, 29, "fill");
      sprite("scenery", "pillar", x + bayWidth / 2, 44, 2.8, 29, "fill");
      tag(info[id].name, x, 8);
      const width = id === "rock" ? 10.3 : id === "water" ? 14.5 : 12.8;
      const height = id === "rock" ? 21.5 : id === "water" ? 14 : 17.5;
      items[id] = sprite("actors", info[id].image, x, upper, width, height, "moving " + id);
      if (id === "water") items.fire = sprite("actors", "fire", x, ground, 16, 25, "fire");
      if (id === "hay" || id === "rock") items.spikes = sprite("actors", "spikes", x, ground, 12, 15);
    }
    addPin(id, x);
  }

  items.horse = sprite("actors", "horse", 13.7, ground, 17.2, 34, "horse");
  items.chest = sprite("actors", "chest", 79.5, ground, 9.3, 17.5, "chest");
  hud();
  status("观察机关，点按金色针环。");
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function burst(name, x, y, w, h) {
  const el = sprite("effects", name, x, y, w, h, "burst");
  setTimeout(() => el.remove(), 900);
}

function fail(reason) {
  state.outcome = "fail";
  $("board").classList.add("failed", "shake");
  status(reason, "bad");
  sound("fail");
  return reason;
}

const moves = {
  async water(x, alive) {
    status("水槽开启，水流正在冲向火堆。");
    items.water.style.opacity = "0";
    burst("waterfall", x, ground, 10, 45);
    sound("water");
    await delay(560);
    if (!alive()) return;
    items.fire.src = asset("steam");
    items.fire.classList.remove("fire");
    burst("splash", x, ground, 16, 20);
    status("火熄灭了，赛道已降温。", "good");
  },
  async hay(x, alive) {
    position(items.hay, x, ground);
    sound("drop");
    await delay(570);
    if (!alive()) return;
    if (current === 3 && !state.done.has("water")) {
      items.hay.src = asset("fire");
      items.hay.classList.add("fire");
      return fail("草料被熔岩点燃，去路封死了。");
    }
    items.hay.src = asset("hay-bridge");
    items.spikes.style.opacity = "0";
    status("草料盖住了尖刺。", "good");
  },
  async bait(x, alive) {
    position(items.bait, x + 1, 66);
    sound("drop");
    status("草料压动了踏板，灰狼正走向侧笼。");
    await delay(380);
    if (!alive()) return;
    items.wolf.classList.add("moving");
    position(items.wolf, x + 2.5, 65.5);
    await delay(530);
    if (!alive()) return;
    status("灰狼已经进笼，关门时机到了。", "good");
  },
  async cage() {
    items.cage.classList.remove("open");
    sound("drop");
    if (!state.done.has("bait")) return fail("笼门提前落下，灰狼留在赛道上。");
    status("笼门落下，灰狼被关住了。", "good");
  },
  async rock(x, alive) {
    position(items.rock, x, ground);
    items.rock.style.rotate = "66deg";
    sound("drop");
    await delay(570);
    if (!alive()) return;
    if (!state.done.has("cage")) {
      items.wolf.classList.add("moving");
      position(items.wolf, 30, ground);
      return fail("落石惊动了灰狼，它冲向了赛马！");
    }
    items.rock.style.opacity = "0";
    items.spikes.src = asset("rubble");
    burst("dust", x, ground, 13, 18);
    status("滚石填平了最后一个陷坑。", "good");
  },
  async gate(_, alive) {
    items.gate.classList.add("open");
    const danger = [
      [items.fire && !state.done.has("water"), "闸门开得太早，前方的火焰拦住了赛马。"],
      [items.wolf && !state.done.has("cage"), "灰狼仍在赛道附近，赛马无法脱身。"],
      [items.spikes && !state.done.has("hay") && !state.done.has("rock"), "前方的尖刺陷坑还没有填平。"],
    ].find(([active]) => active);
    if (danger) {
      items.horse.classList.add("startled");
      position(items.horse, 32, ground);
      return fail(danger[1]);
    }
    status("通道打开了，赛马正奔向出口！", "good");
    items.horse.classList.add("running");
    position(items.horse, 90, ground);
    await delay(890);
    if (!alive()) return;
    items.chest.src = asset("open-chest");
    burst("ring", 90, ground, 18, 37);
    state.outcome = "win";
  },
};

async function pull(id) {
  if (state.busy || state.outcome || state.done.has(id)) return;
  const attempt = state;
  const alive = () => state === attempt;
  state.busy = true;
  state.steps++;
  const btn = pinButtons[id];
  for (const pin of Object.values(pinButtons)) pin.classList.remove("hinted");
  btn.classList.add("removed");
  btn.disabled = true;
  sound("pull");
  hud();
  const [, x] = levels[current].pins.find(([name]) => name === id);
  const reason = await moves[id](x, alive);
  if (!alive()) return;
  if (state.outcome === "fail") {
    await delay(500);
    if (alive()) showResult(false, reason);
    return;
  }
  state.done.add(id);
  state.busy = false;
  if (state.outcome === "win") {
    const first = !progress[current];
    progress[current] = state.steps;
    try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch {}
    hud();
    sound("win");
    showResult(true, first);
  } else {
    hud();
  }
}

function reward(image, value) {
  const el = document.createElement("span");
  el.className = "reward-chip";
  el.append(icon(image), document.createTextNode(value));
  return el;
}

function showResult(win, detail) {
  const dialog = $("result");
  const final = current === levels.length - 1;
  dialog.classList.toggle("failure", !win);
  $("result-icon").src = asset(win ? "trophy" : "spikes");
  $("result-kicker").textContent = levels[current].area + " · 第 " + (current + 1) + " 关";
  $("result-title").textContent = win ? (final ? "王冠赛道开启！" : "救援成功！") : "解谜失败！";
  $("result-description").textContent = win
    ? (final ? "五关全部通关，名马已抵达隐藏赛道。" : "赛马安全脱险，成功取得宝箱。")
    : detail;
  $("reward").replaceChildren(...(win ? [
    reward("star", "三星通关"), reward("coin", detail ? "+" + levels[current].coins : "已领取"),
    reward("chest", "宝箱 1 / 1"),
  ] : [reward("pin", "已拔针 " + state.steps + " / " + levels[current].pins.length)]));
  $("again").lastChild.textContent = win ? "重玩本关" : "重新挑战";
  $("next").querySelector("span").textContent = !win ? "查看提示" : final ? "章节地图" : "继续挑战";
  if ($("map-dialog").open) $("map-dialog").close();
  if (!dialog.open) dialog.showModal();
}

function showMap() {
  $("result").close();
  $("map-count").textContent = "已救援 " + Object.keys(progress).length + " / " + levels.length;
  $("map-nodes").replaceChildren(...levels.map((level, index) => {
    const btn = document.createElement("button");
    const title = document.createElement("b");
    const small = document.createElement("small");
    btn.type = "button";
    btn.className = "map-node";
    btn.classList.toggle("current", index === current);
    btn.disabled = index > unlocked();
    btn.style.left = level.map[0] + "%";
    btn.style.top = level.map[1] + "%";
    title.textContent = level.title;
    small.append(icon(btn.disabled ? "lock" : "star"), document.createTextNode(
      btn.disabled ? " 完成前一关解锁" : progress[index] ? " 三星通关" : " 第 " + (index + 1) + " 关",
    ));
    btn.append(title, small);
    btn.addEventListener("click", () => reset(index));
    return btn;
  }));
  if (!$("map-dialog").open) $("map-dialog").showModal();
}

function hint() {
  if (state.outcome === "fail") reset();
  if (state.busy || state.outcome) return;
  const [id] = levels[current].pins.find(([name]) => !state.done.has(name));
  pinButtons[id].classList.add("hinted");
  status(info[id].hint);
}

$("map").addEventListener("click", showMap);
$("reset").addEventListener("click", () => reset());
$("hint").addEventListener("click", hint);
$("again").addEventListener("click", () => reset());
$("next").addEventListener("click", () => {
  if (state.outcome === "fail") hint();
  else if (current === levels.length - 1) showMap();
  else reset(current + 1);
});
for (const btn of document.querySelectorAll("[data-close]")) {
  btn.addEventListener("click", () => btn.closest("dialog").close());
}
$("sound").addEventListener("click", () => {
  muted = !muted;
  $("sound").classList.toggle("muted", muted);
  $("sound").setAttribute("aria-label", muted ? "开启音效" : "关闭音效");
  $("sound").setAttribute("aria-pressed", String(!muted));
  sound("pull");
});
$("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else status("横置手机可放大游戏画面。");
  } catch {
    status("当前浏览器的全屏功能不可用。");
  }
});

reset();
