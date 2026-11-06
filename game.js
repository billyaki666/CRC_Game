"use strict";

const levels = [
  {
    title: "The Royal Stable", region: "stable", map: [12, 69], coins: 120,
    bays: [
      { id: "water", x: 40, sluice: true },
      { id: "hay", x: 68 },
    ],
  },
  {
    title: "Cinder Crossing", region: "canyon", map: [31, 57], coins: 180,
    bays: [
      { id: "water", x: 43, sluice: true },
      { id: "hay", x: 57.5, after: ["water"] },
    ],
  },
  {
    title: "Wolfgate Tunnels", region: "tunnel", map: [49, 72], coins: 260,
    bays: [
      { id: "bait", x: 32 },
      { id: "water", x: 51 },
      { id: "rock", x: 68, after: ["cage"] },
      { id: "hay", x: 84 },
    ],
  },
  {
    title: "Twin Furnaces", region: "forge", map: [67, 57], coins: 360,
    bays: [
      { id: "water", x: 31, sluice: true },
      { id: "hay", x: 45, after: ["water"] },
      { id: "rock", x: 59 },
      { id: "water-east", x: 76, sluice: true },
    ],
  },
  {
    title: "The Crown Run", region: "arena", map: [86, 41], coins: 580,
    bays: [
      { id: "water", x: 29, sluice: true },
      { id: "hay", x: 43, after: ["water"] },
      { id: "bait", x: 55 },
      { id: "rock", x: 72, after: ["cage"] },
      { id: "water-east", x: 83, sluice: true, outlet: "rock" },
    ],
  },
];

const labels = {
  water: "Water tank", hay: "Hay bundle", rock: "Boulder",
  bait: "Wolf lure", cage: "Cage gate release", sluice: "Sluice", gate: "Stable gate",
};
const kind = (id) => id.split("-")[0];
const $ = (id) => document.getElementById(id);
const asset = (name) => "assets/" + name + ".png";
const mechanismAsset = (name) => "assets/mechanisms/" + name + ".webp";
const ground = 86;
const floorSurface = 86.5;
const wolfGround = floorSurface + 1;
const penSurface = floorSurface - 1.45;
const hayPlateOffset = 7.1;
const hayGuideTop = 74;
const hayPlateSurface = floorSurface - 2;
const shelf = 35;
const sluiceCatch = 51.2;
const baitWidth = 5.5;
const baitHeight = 12;
const stableStart = 9;
const finishLine = 94;
const timing = {
  pin: 620, valve: 570, sluiceRelease: 205, stream: 1050, sluiceStream: 850, blockedStream: 720, steam: 1250,
  drain: 1500, hay: 970, haySlide: 510, bridge: 790, rock: 1430, rockCrush: 320, lure: 1100, impact: 850,
  wolf: 1450, cage: 860, gate: 800, run: 3100, fall: 1450, fallImpact: 490, chest: 1240, result: 950,
};
const storageKey = "horse-pin-rescue-v1";
const format = new Intl.NumberFormat("en");
const progress = {};

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  for (const [i] of levels.entries()) {
    if (!Number.isInteger(saved?.[i]) || saved[i] < 1) break;
    progress[i] = saved[i];
  }
} catch {}

function unlocked() {
  return Math.min(levels.length - 1, Object.keys(progress).length);
}

let current = unlocked();
let state;
let items;
let pins;
let muted = true;

const music = new Audio("assets/audio/bards-tale.wav");
music.loop = true;
music.volume = .26;
music.preload = "none";
const effects = Object.fromEntries(Object.entries({
  pull: ["pin-pull.wav", .55], impact: ["impact.wav", .48],
  gallop: ["gallop.mp3", .62], splash: ["splash.ogg", .53],
}).map(([name, [file, volume]]) => {
  const clip = new Audio("assets/audio/" + file);
  clip.volume = volume;
  clip.loop = name === "gallop";
  return [name, clip];
}));

function sound(name) {
  if (muted) return;
  const clip = effects[name];
  clip.currentTime = 0;
  clip.play().catch(() => {});
}

function stopSound(name) {
  effects[name].pause();
  effects[name].currentTime = 0;
}

function icon(name, source = asset(name)) {
  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  image.draggable = false;
  return image;
}

function position(el, x, y) {
  el.style.setProperty("--x", x + "%");
  el.style.setProperty("--y", y + "%");
}

function sprite(parent, name, x, y, w, h, extra = "", source) {
  const el = icon(name, source);
  el.className = "sprite " + extra;
  el.style.setProperty("--w", w + "%");
  el.style.setProperty("--h", h + "%");
  position(el, x, y);
  $(parent).append(el);
  return el;
}

function mechanism(name, x, y, w, h, extra = "", layer = "scenery") {
  return sprite(layer, name, x, y, w, h, "fill " + extra, mechanismAsset(name));
}

function hingedLeaf(x, y, width, depth) {
  const leaf = icon("iron-leaf", mechanismAsset("iron-leaf"));
  leaf.className = "valve-leaf";
  Object.assign(leaf.style, { left: (x - width / 2) + "%", top: y + "%", width: width + "%", height: depth + "%" });
  $("scenery").append(leaf);
  mechanism("hinge-bearing", x + width / 2, y + 2.3, 2.45, 4.6, "valve-bearing");
  return leaf;
}

function drawHayBridge(model, x) {
  mechanism("hay-guide", x - hayPlateOffset / 2, hayPlateSurface + .65, hayPlateOffset + .25,
    hayPlateSurface - hayGuideTop + 1.25, "hay-guide");
  model.plate = mechanism("pressure-plate", x - hayPlateOffset, floorSurface + .2, 5, 2.7, "pressure-plate");
  model.bridgeLink = panel("bridge-linkage", x - hayPlateOffset, floorSurface + 6.9, hayPlateOffset + 5.7, .65);
  model.bridge = icon("drawbridge", mechanismAsset("drawbridge"));
  model.bridge.className = "drawbridge";
  Object.assign(model.bridge.style, { left: (x - 5.9) + "%", top: floorSurface + "%", width: "11.8%" });
  model.bridge.style.setProperty("--bridge-time", timing.bridge + "ms");
  $("actors").append(model.bridge);
  mechanism("hinge-bearing", x + 5.7, floorSurface + 2.2, 2.1, 4.1, "bridge-bearing", "actors");
}

const animationFiles = [
  "horse-idle", "horse-run", "horse-fall", "fire", "water", "waterfall", "quench",
  "hay-fall", "rock-fall", "hay-impact", "rock-impact", "bait-fall", "bait-impact",
  "wolf-idle", "wolf-walk", "ground-puddle", "chest-open",
];
const motionAsset = (name) => "assets/motion/" + name + ".webp";
const animationImages = Object.fromEntries(animationFiles.map((name) => {
  const image = new Image();
  image.src = motionAsset(name);
  return [name, image];
}));

function animateSprite(el, name, fallback) {
  const image = animationImages[name];
  const apply = () => {
    if (el.dataset.motion !== name) return;
    el.src = image.naturalWidth ? image.src : asset(fallback);
  };
  el.dataset.motion = name;
  apply();
  if (!image.complete) image.addEventListener("load", apply, { once: true });
  return el;
}

function still(el, name) {
  delete el.dataset.motion;
  el.src = motionAsset(name);
}

function panel(className, x, y, w, h, label = "") {
  const el = document.createElement(label ? "b" : "div");
  el.className = className;
  el.textContent = label;
  Object.assign(el.style, { left: x + "%", top: y + "%", width: w + "%", height: h + "%" });
  $("scenery").append(el);
  return el;
}

function tag(label, x, y, extra = "") {
  return panel("cell-tag " + extra, x, y, "auto", "auto", label);
}

function addPin(id, x, y, options = {}) {
  const { vertical = false, label = labels[kind(id)], bay } = options;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pin" + (vertical ? " vertical" : "");
  btn.setAttribute("aria-label", "Pull " + label + " pin");
  btn.title = label;
  position(btn, x, y);
  const art = icon("pin");
  art.src = "assets/bronze-pin.svg";
  btn.style.setProperty("--pull-time", timing.pin + "ms");
  btn.append(art);
  btn.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const rect = art.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    btn.style.setProperty("--shine-x", (vertical ? y : x) * 100 + "%");
    btn.style.setProperty("--shine-y", (vertical ? 1 - x : y) * 100 + "%");
  });
  btn.addEventListener("click", (event) => requestPull(id, event.detail === 0));
  $("pins").append(btn);
  pins[id] = { btn, bay };
}

function status(message, tone = "") {
  const line = $("status");
  line.textContent = message;
  line.dataset.tone = tone;
}

function hud() {
  $("steps").textContent = state.steps + " / " + Object.keys(pins).length + " pins";
  $("coins").textContent = format.format(levels.reduce((sum, level, i) => sum + (progress[i] ? level.coins : 0), 0));
}

function drawBay(bay) {
  const { id, x, sluice, after, outlet } = bay;
  const type = kind(id);
  const model = items[id] = {};
  mechanism("stone-arch", x, 37, 11.6, 25, "loading-arch");
  tag(id === "water-east" ? "East tank" : labels[type], x, 5);
  model.load = sprite("actors", type === "bait" ? "hay" : type, x, shelf,
    type === "water" ? 8.6 : type === "bait" ? baitWidth : 8.1,
    type === "water" ? 15 : type === "bait" ? baitHeight : 18, type === "water" ? "tank-water" : "",
    type === "bait" ? motionAsset("bait-ready") : undefined);
  addPin(id, x, 36.8, { bay, label: id === "water-east" ? "East tank" : labels[type] });

  if (type === "water") {
    mechanism("chute-rails", x, 69, 10.3, 32.5, "chute-rails");
    animateSprite(model.load, "water", "water");
    model.fire = animateSprite(sprite("actors", "fire", x, ground, 10.5, 23, "fire"), "fire", "fire");
    if (sluice) {
      model.sluice = hingedLeaf(x, sluiceCatch + 1, 6.3, 2.4);
      tag("Sluice", x, 43.8, "secondary");
      addPin(id + "-sluice", x, 54.5, { bay, label: id === "water-east" ? "East sluice" : "Sluice" });
    }
    model.drain = mechanism("drain-outlet", x, 94, 10.4, 5.65, "drain-outlet");
    if (outlet) {
      const pit = levels[current].bays.find((candidate) => candidate.id === outlet);
      model.outlet = mechanism("drain-grate", (pit.x + x) / 2, 89.7, x - pit.x, 2.6, "outlet-duct");
      tag("Shared runoff", (x + pit.x) / 2, 93.1, "secondary duct-tag");
    }
  } else if (type === "bait") {
    mechanism("cage-back", x, penSurface + 1.15, 13.4, 23, "cage-back");
    model.linkage = mechanism("cage-linkage", x + 4.25, penSurface - 13.5, 1.15, 13.5, "cage-linkage");
    mechanism("cage-catch", x + 4.25, 62.1, 7.4, 5.8, "cage-catch");
    model.bars = mechanism("cage-grille", x, penSurface + .65, 12.2, 17.4, "cage-door open", "actors");
    model.bars.style.setProperty("--gate-time", timing.cage + "ms");
    items.wolf = animateSprite(sprite("actors", "wolf", x + 7.5, wolfGround, 8.2, 14.6, "wolf"), "wolf-idle", "wolf");
    tag("Cage release", x + 4.25, 50.5, "secondary");
    addPin("cage", x + 4.25, 59.5, { bay });
  } else {
    model.trench = mechanism("stone-trench", x, floorSurface + 7.5, 11.6, 7.8, "stone-trench");
    model.spikes = sprite("actors", "spikes", x, floorSurface + 6.8, 10.3, type === "hay" ? 5.3 : 7.1, "pit-spikes");
    if (type === "hay") drawHayBridge(model, x);
    if (type === "hay" && after) {
      model.heat = panel("hot-pit", x - hayPlateOffset - 4, 77, 8, 11);
      model.heatLabel = tag("Hot trigger", x - hayPlateOffset, 68.5, "secondary");
    }
  }
}

function drawTrack(bays) {
  let start = 2.75;
  for (const { id, x } of bays) {
    if (id !== "hay" && id !== "rock") continue;
    panel("track-section", start, floorSurface, x - 5.5 - start, 7.5);
    start = x + 5.5;
  }
  panel("track-section", start, floorSurface, 97.25 - start, 7.5);
}

function mountHorse() {
  const mount = document.createElement("div");
  mount.className = "horse-mount";
  position(mount, stableStart, floorSurface);
  $("actors").append(mount);
  const horse = icon("horse");
  horse.className = "horse";
  mount.append(horse);
  items.horseTrack = mount;
  items.horse = animateSprite(horse, "horse-idle", "horse");
}

function reset(index = current) {
  current = index;
  const level = levels[current];
  state = { done: new Set(), pending: new Map(), steps: 0, busy: false, outcome: "" };
  items = {};
  pins = {};
  stopSound("gallop");
  for (const id of ["map-dialog", "result"]) $(id).close();
  const board = $("board");
  $("game").dataset.region = level.region;
  board.classList.remove("failed", "shake", "enter");
  for (const id of ["scenery", "actors", "pins", "effects"]) $(id).replaceChildren();
  $("chapter").textContent = "Trial " + String(current + 1).padStart(2, "0") + " / " + String(levels.length).padStart(2, "0");
  $("level-title").textContent = level.title;
  $("zone").textContent = "Royal Circuit";

  drawTrack(level.bays);
  sprite("scenery", "portal", finishLine, floorSurface, 10.5, 31, "portal");
  mechanism("stone-arch", 19.25, floorSurface, 9.1, 34.5, "stable-arch");
  items.gate = sprite("actors", "bars", 19.25, floorSurface, 6.1, 29.6, "gate-bars stable-bars fill");
  items.gate.src = "assets/stable-grille.svg";
  items.gate.style.setProperty("--gate-time", timing.gate + "ms");
  tag("Stable gate", 19.3, 48.6, "secondary");
  addPin("gate", 22.55, 72, { vertical: true });
  for (const bay of level.bays) drawBay(bay);

  mountHorse();
  items.chest = sprite("actors", "chest", 92, ground + .2, 5.4, 13, "chest");
  still(items.chest, "chest-ready");
  hud();
  status("Clear the track and free the racehorse.");
  void board.offsetWidth;
  board.classList.add("enter");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function travel(el, x, y, duration, easing) {
  el.animate([
    { left: el.style.getPropertyValue("--x"), top: el.style.getPropertyValue("--y") },
    { left: x + "%", top: y + "%" },
  ], { duration, easing });
  position(el, x, y);
  return wait(duration);
}

function effect(name, fallback, x, y, width, height, extra = "") {
  return animateSprite(sprite("effects", fallback, x, y, width, height, extra), name, fallback);
}

function fail(reason, symbol = "spikes") {
  state.outcome = "fail";
  state.failureIcon = symbol;
  clearPending();
  $("board").classList.add("failed", "shake");
  status(reason, "bad");
  return reason;
}

async function openSluice(bay, alive) {
  const model = items[bay.id];
  const hatch = model.sluice;
  hatch.style.setProperty("--valve-time", timing.valve + "ms");
  hatch.classList.add("open");
  status("The spillway is opening.");
  if (model.held) {
    await wait(timing.sluiceRelease);
    if (!alive()) return;
    return releaseWater(bay, alive, true);
  }
  await wait(timing.valve);
  if (!alive()) return;
  status("The spillway is open.", "good");
}

async function drainPool(model, x, alive) {
  await wait(360);
  if (!alive()) return;
  model.outlet?.classList.add("flowing");
  model.drain.classList.add("flowing");
  const runoff = effect("waterfall", "waterfall", x, 94, 2, 7.3, "drain-stream");
  runoff.style.setProperty("--drain-time", timing.drain + "ms");
  model.pool.style.setProperty("--drain-time", timing.drain + "ms");
  model.pool.classList.add("draining");
  await wait(timing.drain);
  if (!alive()) return;
  runoff.remove();
  model.drain.classList.remove("flowing");
  model.outlet?.classList.remove("flowing");
  model.pool.remove();
  model.pool = null;
}

async function releaseWater(bay, alive, fromSluice = false) {
  const { id, x, sluice, outlet } = bay;
  const model = items[id];
  const blocked = sluice && !fromSluice && !state.done.has(id + "-sluice");
  const source = fromSluice ? model.held : model.load;
  if (fromSluice) model.held = null;
  const impactY = blocked ? sluiceCatch : ground;
  const stream = effect("waterfall", "waterfall", x, impactY, 4.7, impactY - (fromSluice ? sluiceCatch : shelf), "stream");
  const fallTime = blocked ? timing.blockedStream : fromSluice ? timing.sluiceStream : timing.stream;
  stream.style.setProperty("--flow-time", fallTime + "ms");
  source.style.setProperty("--flow-time", (fromSluice ? 460 : fallTime) + "ms");
  source.classList.add("emptying");
  status("Water is rushing down the shaft.");
  await wait(fallTime);
  if (!alive()) return;
  source.remove();
  if (blocked) {
    sound("splash");
    stream.classList.add("draining");
    model.held = animateSprite(sprite("actors", "water", x, impactY, 5.9, 8, "tank-water"),
      "water", "water");
    status("The sluice is holding the water.");
    await wait(timing.impact);
    if (!alive()) return;
    stream.remove();
    return;
  }

  model.fire.classList.add("quenched");
  stream.classList.add("draining");
  const steam = effect("quench", "steam", x, ground + .5, 15, 25, "steam-burst");
  steam.style.setProperty("--steam-time", timing.steam + "ms");
  const sealed = state.done.has(outlet);
  model.pool = animateSprite(sprite("actors", "splash", x, floorSurface + 1.2, sealed ? 16 : 12.5,
    sealed ? 5.2 : 4.1, "pool"), "ground-puddle", "splash");
  const runoff = sealed ? null : drainPool(model, x, alive);
  status("The water hit the fire. Steam is rising.");
  sound("splash");
  await wait(timing.steam);
  if (!alive()) return;
  stream.remove();
  model.fire.remove();
  model.fire = null;
  steam.remove();
  if (sealed) return fail("The boulder sealed the east runoff and flooded the track.");
  status("The fire is out. Runoff is draining through the floor.", "good");
  await runoff;
  if (alive()) status("The fire is out. Runoff has drained through the floor.", "good");
}

function prerequisiteCleared(id) {
  return kind(id) === "water" ? !items[id].fire : state.done.has(id);
}

async function releaseHay(bay, alive) {
  const { x, after } = bay;
  const model = items.hay;
  const plateX = x - hayPlateOffset;
  animateSprite(model.load, "hay-fall", "hay");
  status("The hay is falling onto the guide chute.");
  await travel(model.load, x, hayGuideTop, timing.hay, "cubic-bezier(.38,.08,.69,.58)");
  if (!alive()) return;
  await travel(model.load, plateX, hayPlateSurface, timing.haySlide, "ease-in");
  if (!alive()) return;
  model.load.remove();
  const hit = effect("hay-impact", "dust", plateX, hayPlateSurface, 6.2, 9, "impact");
  sound("impact");
  if (after?.some((step) => !prerequisiteCleared(step))) {
    animateSprite(sprite("actors", "fire", plateX, floorSurface, 9, 16, "fire"), "fire", "fire");
    await wait(timing.impact);
    if (!alive()) return;
    hit.remove();
    return fail("Heat from the nearby fire burned the hay before it could release the bridge.", "fire");
  }
  model.plate.classList.add("weighted");
  model.bridgeLink.classList.add("engaged");
  model.bridge.classList.add("lowered");
  sprite("actors", "hay-bridge", plateX, hayPlateSurface, 5.7, 7.4, "plate-hay");
  status("The hay trips the latch. The bridge is lowering over the spikes.");
  await wait(timing.bridge);
  if (!alive()) return;
  hit.remove();
  status("The drawbridge spans the pit. The spikes are below it.", "good");
}

async function releaseLoad(bay, alive) {
  const { id, x, after } = bay;
  if (id === "hay") return releaseHay(bay, alive);
  const model = items[id];
  const lure = id === "bait";
  const landing = lure ? penSurface + .25 : floorSurface + 1.4;
  animateSprite(model.load, id + "-fall", lure ? "hay" : "rock");
  status(lure ? "The lure is falling into the pen." : "The boulder is falling.");
  await travel(model.load, x, landing, lure ? timing.lure : timing.rock,
    "cubic-bezier(.38,.08,.69,.58)");
  if (!alive()) return;

  sound("impact");
  model.load.remove();
  const hit = effect(id + "-impact", "dust", x, landing, lure ? baitWidth : 11, lure ? baitHeight : 16, "impact");
  if (lure) {
    animateSprite(items.wolf, "wolf-walk", "wolf");
    status("The wolf is following the lure into the pen.");
    await travel(items.wolf, x + 4, wolfGround, 580, "linear");
    if (!alive()) return;
    hit.remove();
    sprite("actors", "hay", x, landing, baitWidth, baitHeight, "", motionAsset("bait-rest"));
    items.wolf.classList.add("in-pen");
    await travel(items.wolf, x - .55, penSurface + .95, timing.wolf - 580, "ease-out");
    if (!alive()) return;
    animateSprite(items.wolf, "wolf-idle", "wolf");
    status("The wolf has entered the cage.", "good");
    return;
  }
  model.spikes.classList.add("crushed");
  await wait(timing.rockCrush);
  if (!alive()) return;
  model.spikes.remove();
  model.trench.src = mechanismAsset("rubble-trench");
  const sharedOutlet = levels[current].bays.find((candidate) => candidate.outlet === id);
  if (sharedOutlet) items[sharedOutlet.id].outlet.classList.add("sealed");
  if (after?.some((step) => !prerequisiteCleared(step))) {
    const wolf = items.wolf;
    animateSprite(wolf, "wolf-walk", "wolf");
    await travel(wolf, 23, wolfGround, timing.wolf, "ease-in");
    if (!alive()) return;
    hit.remove();
    return fail("The impact startled the wolf and drove it onto the track.", "wolf");
  }
  await wait(timing.impact - timing.rockCrush);
  if (!alive()) return;
  hit.remove();
  status(sharedOutlet && items[sharedOutlet.id].fire ? "The boulder crushed the spikes and blocked the east drain."
    : "The boulder crushed the spikes and wedged into the pit.", "good");
}

async function closeCage(bay, alive) {
  const bars = items[bay.id].bars;
  items[bay.id].linkage.classList.add("released");
  bars.classList.remove("open");
  await wait(timing.cage);
  if (!alive()) return;
  sound("impact");
  if (!state.done.has("bait")) return fail("The cage shut before the wolf entered.");
  status("The wolf is safely behind bars.", "good");
}

async function openStable(alive) {
  clearPending();
  for (const { btn } of Object.values(pins)) btn.disabled = true;
  items.gate.classList.add("open");
  status("The stable gate is lifting.");
  await wait(timing.gate);
  if (!alive()) return;
  return runHorse(alive);
}

function firstHazard() {
  for (const { id, x } of levels[current].bays) {
    if (kind(id) === "water") {
      if (items[id].fire) return { x, icon: "fire", effect: "dust", message: "The racehorse stumbled at the flames." };
      if (items[id].pool) return { x, icon: "water", effect: "splash", message: "The racehorse slipped on the flooded track." };
    } else if (id === "bait") {
      if (!state.done.has("cage")) {
        return { x: state.done.has("bait") ? x : x + 7.5, icon: "wolf", effect: "dust", message: "The loose wolf startled the racehorse." };
      }
    } else if (!state.done.has(id)) {
      return { x, icon: "spikes", effect: "dust", message: "The racehorse stumbled at the open spike pit." };
    }
  }
}

async function fallAtHazard(horse, hazard, alive) {
  status(hazard.message, "bad");
  animateSprite(horse, "horse-fall", "horse");
  items.horseTrack.classList.replace("galloping", "fallen");
  const stumble = travel(items.horseTrack, hazard.x - 7.4, floorSurface, timing.fall, "ease-out");
  await wait(timing.fallImpact);
  if (!alive()) return;
  const impact = sprite("effects", hazard.effect, hazard.x - 4.5, ground, 11, 15, "fall-burst");
  sound(hazard.effect === "splash" ? "splash" : "impact");
  await stumble;
  if (!alive()) return;
  impact.remove();
  if (animationImages["horse-fall"].naturalWidth) still(horse, "horse-fallen");
  return fail(hazard.message, hazard.icon);
}

async function runHorse(alive) {
  const horse = items.horse;
  const hazard = firstHazard();
  const target = hazard ? hazard.x - 6 : finishLine;
  const duration = Math.max(1050, timing.run * (target - stableStart) / (finishLine - stableStart));
  status("The racehorse is on the move.");
  animateSprite(horse, "horse-run", "horse");
  items.horseTrack.classList.add("galloping");
  sound("gallop");
  await travel(items.horseTrack, target, floorSurface, duration, "cubic-bezier(.34,.18,.64,.92)");
  if (!alive()) return;
  stopSound("gallop");
  if (hazard) return fallAtHazard(horse, hazard, alive);
  items.horseTrack.classList.add("escaped");
  animateSprite(items.chest, "chest-open", "open-chest");
  sprite("effects", "ring", finishLine, ground, 14, 32, "portal-flash");
  await wait(timing.chest);
  if (!alive()) return;
  still(items.chest, "chest-opened");
  state.outcome = "win";
  status("The racehorse is safe.", "good");
}

function requestPull(id, fromKeyboard) {
  if (state.outcome || state.done.has(id) || pins[id].btn.disabled || state.pending.has(id)) return;
  if (!state.busy) {
    void pull(id, fromKeyboard);
    return;
  }
  state.pending.set(id, fromKeyboard);
  pins[id].btn.classList.add("queued");
}

function clearPending() {
  for (const id of state.pending.keys()) pins[id].btn.classList.remove("queued");
  state.pending.clear();
}

async function pull(id, fromKeyboard = false) {
  if (state.busy || state.outcome || state.done.has(id)) return;
  const attempt = state;
  const alive = () => state === attempt;
  const { btn, bay } = pins[id];
  const nextPin = fromKeyboard && Object.values(pins)
    .find(({ btn: other }) => other !== btn && !other.disabled && !other.classList.contains("queued"))?.btn;
  state.busy = true;
  state.steps++;
  btn.classList.remove("queued");
  btn.classList.add("removed");
  btn.disabled = true;
  if (nextPin) nextPin.focus();
  sound("pull");
  hud();
  await wait(timing.pin);
  if (!alive()) return;

  let reason;
  if (id === "gate") reason = await openStable(alive);
  else if (id === "cage") reason = await closeCage(bay, alive);
  else if (id !== bay.id) reason = await openSluice(bay, alive);
  else if (kind(id) === "water") reason = await releaseWater(bay, alive);
  else reason = await releaseLoad(bay, alive);
  if (!alive()) return;

  if (state.outcome === "fail") {
    await wait(timing.result);
    if (alive()) showResult(false, reason);
    return;
  }
  state.done.add(id);
  for (const candidate of levels[current].bays) {
    if (items[candidate.id].heat && candidate.after.every(prerequisiteCleared)) {
      items[candidate.id].heat.classList.add("cooled");
      items[candidate.id].heatLabel.textContent = "Bridge trigger";
    }
  }
  state.busy = false;
  if (state.outcome === "win") {
    clearPending();
    const first = !progress[current];
    progress[current] = state.steps;
    try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch {}
    $("coins").parentElement.classList.toggle("earned", first);
    hud();
    showResult(true, first);
  } else if (state.pending.size) {
    const [next, keyboard] = state.pending.entries().next().value;
    state.pending.delete(next);
    void pull(next, keyboard);
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
  $("result-icon").src = asset(win ? "trophy" : state.failureIcon);
  $("result-kicker").textContent = "Trial " + (current + 1) + " · " + levels[current].title;
  $("result-title").textContent = win ? (final ? "Crown Run Complete" : "Track Cleared") : "Run Stopped";
  $("result-description").textContent = win
    ? (final ? "The royal racehorse reached the finish." : "The racehorse reached the exit and collected the chest.")
    : detail;
  $("reward").replaceChildren(...(win ? [
    reward("star", "Trial cleared"), reward("coin", detail ? "+" + levels[current].coins : "Reward claimed"),
  ] : [reward("pin", state.steps + (state.steps === 1 ? " pin pulled" : " pins pulled"))]));
  $("again").lastChild.textContent = win ? "Replay" : "Retry Trial";
  $("next").hidden = !win;
  $("next").querySelector("span").textContent = final ? "Level Map" : "Next Level";
  if ($("map-dialog").open) $("map-dialog").close();
  if (!dialog.open) dialog.showModal();
  if (!win) $("again").focus();
}

function showMap() {
  $("result").close();
  $("map-count").textContent = Object.keys(progress).length + " / " + levels.length + " cleared";
  $("map-nodes").replaceChildren(...levels.map((level, index) => {
    const btn = document.createElement("button");
    const title = document.createElement("b");
    const small = document.createElement("small");
    btn.type = "button";
    btn.className = "map-node";
    btn.classList.toggle("current", index === current);
    if (index === current) btn.setAttribute("aria-current", "step");
    btn.disabled = index > unlocked();
    btn.style.left = level.map[0] + "%";
    btn.style.top = level.map[1] + "%";
    title.textContent = level.title;
    small.append(icon(btn.disabled ? "lock" : "star"), document.createTextNode(
      btn.disabled ? " Locked" : progress[index] ? " Cleared" : " Trial " + (index + 1),
    ));
    btn.append(title, small);
    btn.addEventListener("click", () => reset(index));
    return btn;
  }));
  if (!$("map-dialog").open) $("map-dialog").showModal();
}

$("map").addEventListener("click", showMap);
$("reset").addEventListener("click", () => reset());
$("again").addEventListener("click", () => reset());
$("next").addEventListener("click", () => {
  if (current === levels.length - 1) showMap();
  else reset(current + 1);
});
for (const btn of document.querySelectorAll("[data-close]")) {
  btn.addEventListener("click", () => btn.closest("dialog").close());
}
$("sound").addEventListener("click", async () => {
  muted = !muted;
  $("sound").classList.toggle("muted", muted);
  $("sound").setAttribute("aria-label", muted ? "Enable audio" : "Mute audio");
  $("sound").setAttribute("aria-pressed", String(!muted));
  if (muted) {
    music.pause();
    for (const name of Object.keys(effects)) stopSound(name);
  } else {
    music.play().catch(() => {});
    if (items.horse.dataset.motion === "horse-run" && !items.horseTrack.classList.contains("escaped")) sound("gallop");
  }
});
$("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else status("Rotate your device for a larger view.");
  } catch {
    status("Full screen is unavailable in this browser.");
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    music.pause();
    stopSound("gallop");
  } else if (!muted) {
    music.play().catch(() => {});
    if (state.busy && !state.outcome && items.horse.dataset.motion === "horse-run" &&
        !items.horseTrack.classList.contains("escaped")) sound("gallop");
  }
});

reset();

