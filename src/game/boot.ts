/**
 * boot.ts — «Некромант: Оборона Алтаря». 2D pixel-art arena defense (15 волн, 3 босса, прокачка).
 *
 * Контракт с оболочкой (src/pages/Home.tsx):
 *   startGame(canvas)  монтирует игру на существующий <canvas>
 *   stopGame()         снимает цикл, слушатели и пробу
 * Контракт с scripts/verify-game.mjs:
 *   window.__GAME_READY__ = true после первого отрисованного кадра
 *   window.__gameProbe()  -> { x, y, z } — W двигает вверх (z уменьшается), D вправо (x растёт)
 *   Space переводит из титульного экрана в игру
 */

import { GameLoop } from "./engine";
import { Input } from "./input";
import { AudioSystem } from "./audio";

declare global {
  interface Window {
    __gameProbe?: () => { x: number; y: number; z: number; state?: string; wave?: number; playerHp?: number; altarHp?: number; enemies?: number; skeletons?: number };
    __GAME_READY__?: boolean;
  }
}

// ---------- Константы мира ----------
const WORLD = 2000;
const ALTAR = { x: WORLD / 2, y: WORLD / 2 };
const ALTAR_MAX_HP = 100;
const BOLT_SPEED = 560;
const BOLT_RANGE = 470;
const CORPSE_RAISE_TIME = 2.2;

// стартовые статы (прокачка меняет их через апгрейды)
const BASE = {
  playerMaxHp: 60,
  playerSpeed: 270,
  boltCd: 0.55,
  boltDmg: 13,
  skelCap: 6,
  skelDmg: 8,
  skelHp: 30,
  soulHeal: 3,
};

interface WaveDef { peasants: number; hounds: number; guards: number; torch: number; boss: "gavrila" | "bonifaciy" | "gotfrid" | null }
const WAVES: WaveDef[] = [
  { peasants: 6,  hounds: 0,  guards: 0, torch: 0, boss: null },
  { peasants: 10, hounds: 0,  guards: 0, torch: 0, boss: null },
  { peasants: 8,  hounds: 4,  guards: 0, torch: 0, boss: null },
  { peasants: 14, hounds: 6,  guards: 0, torch: 0, boss: null },
  { peasants: 8,  hounds: 2,  guards: 0, torch: 0, boss: "gavrila" },
  { peasants: 12, hounds: 6,  guards: 0, torch: 0, boss: null },
  { peasants: 12, hounds: 6,  guards: 3, torch: 0, boss: null },
  { peasants: 14, hounds: 6,  guards: 4, torch: 0, boss: null },
  { peasants: 12, hounds: 8,  guards: 4, torch: 2, boss: null },
  { peasants: 10, hounds: 4,  guards: 2, torch: 0, boss: "bonifaciy" },
  { peasants: 18, hounds: 10, guards: 5, torch: 2, boss: null },
  { peasants: 16, hounds: 8,  guards: 6, torch: 3, boss: null },
  { peasants: 20, hounds: 12, guards: 6, torch: 3, boss: null },
  { peasants: 22, hounds: 12, guards: 8, torch: 4, boss: null },
  { peasants: 12, hounds: 6,  guards: 4, torch: 2, boss: "gotfrid" },
];

const SPRITE_FILES: Record<string, string> = {
  necromancer: "/sprites/necromancer.png",
  necro_walk_0: "/sprites/necro_walk_0.png",
  necro_walk_1: "/sprites/necro_walk_1.png",
  necro_walk_2: "/sprites/necro_walk_2.png",
  necro_walk_3: "/sprites/necro_walk_3.png",
  necro_cast_0: "/sprites/necro_cast_0.png",
  necro_cast_1: "/sprites/necro_cast_1.png",
  necro_cast_2: "/sprites/necro_cast_2.png",
  necro_cast_3: "/sprites/necro_cast_3.png",
  peasant_walk_0: "/sprites/peasant_walk_0.png",
  peasant_walk_1: "/sprites/peasant_walk_1.png",
  peasant_walk_2: "/sprites/peasant_walk_2.png",
  peasant_walk_3: "/sprites/peasant_walk_3.png",
  peasant_attack_0: "/sprites/peasant_attack_0.png",
  peasant_attack_1: "/sprites/peasant_attack_1.png",
  peasant_attack_2: "/sprites/peasant_attack_2.png",
  peasant_attack_3: "/sprites/peasant_attack_3.png",
  hound_run_0: "/sprites/hound_run_0.png",
  hound_run_1: "/sprites/hound_run_1.png",
  hound_run_2: "/sprites/hound_run_2.png",
  hound_run_3: "/sprites/hound_run_3.png",
  hound_attack_0: "/sprites/hound_attack_0.png",
  hound_attack_1: "/sprites/hound_attack_1.png",
  hound_attack_2: "/sprites/hound_attack_2.png",
  hound_attack_3: "/sprites/hound_attack_3.png",
  skeleton_walk_0: "/sprites/skeleton_walk_0.png",
  skeleton_walk_1: "/sprites/skeleton_walk_1.png",
  skeleton_walk_2: "/sprites/skeleton_walk_2.png",
  skeleton_walk_3: "/sprites/skeleton_walk_3.png",
  skeleton_attack_0: "/sprites/skeleton_attack_0.png",
  skeleton_attack_1: "/sprites/skeleton_attack_1.png",
  skeleton_attack_2: "/sprites/skeleton_attack_2.png",
  skeleton_attack_3: "/sprites/skeleton_attack_3.png",
  boss_walk_0: "/sprites/boss_walk_0.png",
  boss_walk_1: "/sprites/boss_walk_1.png",
  boss_walk_2: "/sprites/boss_walk_2.png",
  boss_walk_3: "/sprites/boss_walk_3.png",
  boss_attack_0: "/sprites/boss_attack_0.png",
  boss_attack_1: "/sprites/boss_attack_1.png",
  boss_attack_2: "/sprites/boss_attack_2.png",
  boss_attack_3: "/sprites/boss_attack_3.png",
  guard_walk_0: "/sprites/guard_walk_0.png",
  guard_walk_1: "/sprites/guard_walk_1.png",
  guard_walk_2: "/sprites/guard_walk_2.png",
  guard_walk_3: "/sprites/guard_walk_3.png",
  guard_attack_0: "/sprites/guard_attack_0.png",
  guard_attack_1: "/sprites/guard_attack_1.png",
  guard_attack_2: "/sprites/guard_attack_2.png",
  guard_attack_3: "/sprites/guard_attack_3.png",
  torch_walk_0: "/sprites/torch_walk_0.png",
  torch_walk_1: "/sprites/torch_walk_1.png",
  torch_walk_2: "/sprites/torch_walk_2.png",
  torch_walk_3: "/sprites/torch_walk_3.png",
  torch_attack_0: "/sprites/torch_attack_0.png",
  torch_attack_1: "/sprites/torch_attack_1.png",
  torch_attack_2: "/sprites/torch_attack_2.png",
  torch_attack_3: "/sprites/torch_attack_3.png",
  bonifaciy_walk_0: "/sprites/bonifaciy_walk_0.png",
  bonifaciy_walk_1: "/sprites/bonifaciy_walk_1.png",
  bonifaciy_walk_2: "/sprites/bonifaciy_walk_2.png",
  bonifaciy_walk_3: "/sprites/bonifaciy_walk_3.png",
  bonifaciy_attack_0: "/sprites/bonifaciy_attack_0.png",
  bonifaciy_attack_1: "/sprites/bonifaciy_attack_1.png",
  bonifaciy_attack_2: "/sprites/bonifaciy_attack_2.png",
  bonifaciy_attack_3: "/sprites/bonifaciy_attack_3.png",
  gotfrid_walk_0: "/sprites/gotfrid_walk_0.png",
  gotfrid_walk_1: "/sprites/gotfrid_walk_1.png",
  gotfrid_walk_2: "/sprites/gotfrid_walk_2.png",
  gotfrid_walk_3: "/sprites/gotfrid_walk_3.png",
  gotfrid_attack_0: "/sprites/gotfrid_attack_0.png",
  gotfrid_attack_1: "/sprites/gotfrid_attack_1.png",
  gotfrid_attack_2: "/sprites/gotfrid_attack_2.png",
  gotfrid_attack_3: "/sprites/gotfrid_attack_3.png",
  peasant: "/sprites/peasant.png",
  hound: "/sprites/hound.png",
  skeleton: "/sprites/skeleton.png",
  gavrila: "/sprites/gavrila.png",
  bonifaciy: "/sprites/bonifaciy.png",
  gotfrid: "/sprites/gotfrid.png",
  guard: "/sprites/guard.png",
  torch: "/sprites/torch.png",
  altar: "/sprites/altar.png",
  floor: "/sprites/floor.png",
};

interface Sprite { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number }

function trimSprite(img: HTMLImageElement): Sprite {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
  for (let y = 0; y < c.height; y += 2) {
    for (let x = 0; x < c.width; x += 2) {
      if (data[(y * c.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX) { minX = 0; minY = 0; maxX = c.width; maxY = c.height; }
  return { img, sx: minX, sy: minY, sw: maxX - minX, sh: maxY - minY };
}

// ---------- Сущности ----------
type EnemyKind = "peasant" | "hound" | "guard" | "torch" | "gavrila" | "bonifaciy" | "gotfrid";
interface Enemy {
  kind: EnemyKind;
  x: number; y: number; hp: number; maxHp: number;
  speed: number; dmg: number; atkCd: number;
  zig: number; flash: number; dead: boolean;
  kbX: number; kbY: number;                 // отброс
  atkT: number; atkDur: number;             // анимация атаки (-1 = нет)
  ax: number; ay: number;                   // направление атаки
  hitDone: boolean;
  moving: boolean;                          // идёт ли сейчас (для выбора кадров)
}
interface Skeleton { x: number; y: number; hp: number; atkCd: number; flash: number; atkT: number; ax: number; ay: number; moving: boolean; zig: number }
interface Bolt { x: number; y: number; vx: number; vy: number; life: number; ang: number; trail: number }
interface Soul { x: number; y: number; t: number }
interface Corpse { x: number; y: number; t: number; burning: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Dying { kind: string; x: number; y: number; t: number; flip: boolean }
interface DmgNum { x: number; y: number; txt: string; life: number; color: string }
interface Ring { x: number; y: number; t: number; max: number; color: string; width: number }

type GameState = "title" | "playing" | "upgrade" | "paused" | "won" | "lost";

// ---------- Прокачка между волнами ----------
interface Upgrade { id: string; name: string; desc: string; icon: string; apply: () => void }

// анимационные сеты врагов: спрайт-сеты, частота кадров, компенсация высоты атаки, базовая высота
const ANIMS: Record<string, { walk: string; attack: string; fps: number; atkScale: number; h: number }> = {
  peasant:   { walk: "peasant_walk",   attack: "peasant_attack",   fps: 8, atkScale: 1.37, h: 100 },
  hound:     { walk: "hound_run",      attack: "hound_attack",     fps: 11, atkScale: 1.17, h: 75 },
  guard:     { walk: "guard_walk",     attack: "guard_attack",     fps: 5,  atkScale: 1.30, h: 110 },
  torch:     { walk: "torch_walk",     attack: "torch_attack",     fps: 9,  atkScale: 1.42, h: 100 },
  gavrila:   { walk: "boss_walk",      attack: "boss_attack",      fps: 5,  atkScale: 1.48, h: 200 },
  bonifaciy: { walk: "bonifaciy_walk", attack: "bonifaciy_attack", fps: 4,  atkScale: 1.21, h: 210 },
  gotfrid:   { walk: "gotfrid_walk",   attack: "gotfrid_attack",   fps: 5,  atkScale: 1.36, h: 210 },
};

let session: { dispose: () => void } | null = null;

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame();

  const ctx = canvas.getContext("2d")!;
  const input = new Input(canvas);
  const audio = new AudioSystem();

  let lastTap = { x: -1, y: -1 };
  const onTap = (e: PointerEvent): void => {
    input.actions.add("Tap");
    lastTap = { x: e.clientX, y: e.clientY };
  };
  canvas.addEventListener("pointerdown", onTap);

  const sprites: Partial<Record<string, Sprite>> = {};
  let loaded = false;
  const loads = Object.entries(SPRITE_FILES).map(([key, src]) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { sprites[key] = key === "floor" ? { img, sx: 0, sy: 0, sw: img.width, sh: img.height } : trimSprite(img); resolve(); };
      img.onerror = () => resolve();
      img.src = src;
    }),
  );
  Promise.all(loads).then(() => { loaded = true; });

  // ---------- Состояние ----------
  let state: GameState = "title";
  let time = 0;
  let wave = 0;
  let souls = 0;
  // прокачиваемые статы
  let playerMaxHp = BASE.playerMaxHp;
  let playerSpeed = BASE.playerSpeed;
  let boltCdBase = BASE.boltCd;
  let boltDmg = BASE.boltDmg;
  let skelCap = BASE.skelCap;
  let skelDmg = BASE.skelDmg;
  let skelHpMax = BASE.skelHp;
  let soulHeal = BASE.soulHeal;
  let upgradeChoices: Upgrade[] = [];
  let shake = 0;
  let banner = "";
  let bannerT = 0;
  let waveBreak = 0;
  let spawnQueue: Array<Enemy["kind"]> = [];
  let spawnT = 0;
  let boltCd = 0;
  let hurtCd = 0;
  let playerHurtFlash = 0;   // красная виньетка при ударе по игроку
  const CAST_DUR = 0.36;     // длительность анимации каста (4 кадра)
  const CAST_FIRE_T = 0.18;  // момент вылета болта (кадр 2 — выпад посоха)
  let castT = -1;            // анимация каста
  let castX = 1, castY = 0;  // направление каста
  let boltFired = true;      // болт из текущего каста уже вылетел

  const player = { x: ALTAR.x, y: ALTAR.y + 180, hp: BASE.playerMaxHp };
  const altar = { hp: ALTAR_MAX_HP };
  const enemies: Enemy[] = [];
  const skeletons: Skeleton[] = [];
  const bolts: Bolt[] = [];
  const soulsArr: Soul[] = [];
  const corpses: Corpse[] = [];
  const particles: Particle[] = [];
  const dying: Dying[] = [];
  const dmgNums: DmgNum[] = [];
  const rings: Ring[] = [];

  const cam = { x: player.x, y: player.y };

  function resize(): void {
    canvas.width = window.innerWidth * Math.min(window.devicePixelRatio, 2);
    canvas.height = window.innerHeight * Math.min(window.devicePixelRatio, 2);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  }
  resize();
  window.addEventListener("resize", resize);

  function reset(): void {
    wave = 0; souls = 0; shake = 0; banner = ""; bannerT = 0;
    waveBreak = 0; spawnQueue = []; spawnT = 0; boltCd = 0; castT = -1;
    playerMaxHp = BASE.playerMaxHp; playerSpeed = BASE.playerSpeed;
    boltCdBase = BASE.boltCd; boltDmg = BASE.boltDmg;
    skelCap = BASE.skelCap; skelDmg = BASE.skelDmg; skelHpMax = BASE.skelHp; soulHeal = BASE.soulHeal;
    upgradeChoices = [];
    player.x = ALTAR.x; player.y = ALTAR.y + 180; player.hp = playerMaxHp;
    altar.hp = ALTAR_MAX_HP;
    enemies.length = 0; skeletons.length = 0; bolts.length = 0;
    soulsArr.length = 0; corpses.length = 0; particles.length = 0;
    dying.length = 0; dmgNums.length = 0; rings.length = 0;
    startNextWave();
  }

  function startNextWave(): void {
    wave++;
    if (wave > WAVES.length) { state = "won"; audio.sfx("win"); return; }
    const def = WAVES[wave - 1];
    spawnQueue = [];
    for (let i = 0; i < def.peasants; i++) spawnQueue.push("peasant");
    for (let i = 0; i < def.hounds; i++) spawnQueue.push("hound");
    for (let i = 0; i < def.guards; i++) spawnQueue.push("guard");
    for (let i = 0; i < def.torch; i++) spawnQueue.push("torch");
    for (let i = spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spawnQueue[i], spawnQueue[j]] = [spawnQueue[j], spawnQueue[i]];
    }
    if (def.boss) spawnQueue.splice(Math.floor(spawnQueue.length / 2), 0, def.boss);
    spawnT = 0.5;
    const BOSS_NAMES: Record<string, string> = {
      gavrila: "СТАРОСТА ГАВРИЛА ИДЁТ!",
      bonifaciy: "ИНКВИЗИТОР БОНИФАЦИЙ ИДЁТ!",
      gotfrid: "ПАЛАДИН ГОТФРИД ИДЁТ!",
    };
    banner = def.boss ? BOSS_NAMES[def.boss] : `ВОЛНА ${wave} / ${WAVES.length}`;
    bannerT = 2.2;
    audio.sfx("ui");
  }

  function spawnPoint(): { x: number; y: number } {
    const a = Math.random() * Math.PI * 2;
    const r = 700 + Math.random() * 250;
    return {
      x: Math.max(60, Math.min(WORLD - 60, ALTAR.x + Math.cos(a) * r)),
      y: Math.max(60, Math.min(WORLD - 60, ALTAR.y + Math.sin(a) * r)),
    };
  }

  function spawnEnemy(kind: Enemy["kind"]): void {
    const p = spawnPoint();
    const base = { x: p.x, y: p.y, atkCd: 0.4, zig: Math.random() * 10, flash: 0, dead: false, kbX: 0, kbY: 0, atkT: -1, atkDur: 0.34, ax: 0, ay: 0, hitDone: false, moving: false };
    if (kind === "peasant") enemies.push({ ...base, kind, hp: 26, maxHp: 26, speed: 80, dmg: 4 });
    else if (kind === "hound") enemies.push({ ...base, kind, hp: 14, maxHp: 14, speed: 215, dmg: 8, atkDur: 0.26 });
    else if (kind === "guard") enemies.push({ ...base, kind, hp: 95, maxHp: 95, speed: 52, dmg: 9, atkDur: 0.45 });
    else if (kind === "torch") enemies.push({ ...base, kind, hp: 30, maxHp: 30, speed: 105, dmg: 6, atkDur: 0.4 });
    else if (kind === "bonifaciy") {
      enemies.push({ ...base, kind, hp: 520, maxHp: 520, speed: 68, dmg: 26, atkDur: 0.6 });
      shake = Math.max(shake, 0.4);
    } else if (kind === "gotfrid") {
      enemies.push({ ...base, kind, hp: 780, maxHp: 780, speed: 78, dmg: 34, atkDur: 0.55 });
      shake = Math.max(shake, 0.5);
    } else {
      enemies.push({ ...base, kind, hp: 240, maxHp: 240, speed: 70, dmg: 20, atkDur: 0.55 });
      shake = Math.max(shake, 0.4);
    }
  }

  function burst(x: number, y: number, color: string, n: number, spd = 120): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = spd * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.4 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
    }
  }

  function dmgNum(x: number, y: number, val: number, color: string): void {
    if (dmgNums.length > 50) dmgNums.shift();
    dmgNums.push({ x: x + (Math.random() - 0.5) * 20, y: y - 70, txt: String(val), life: 0, color });
  }

  function dist(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
  }

  function nearestEnemy(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = range;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function hurtEnemy(e: Enemy, dmg: number, kbx: number, kby: number): void {
    e.hp -= dmg;
    e.flash = 0.12;
    e.kbX += kbx; e.kbY += kby;
    dmgNum(e.x, e.y, dmg, "#d8ffd8");
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    dying.push({ kind: e.kind === "gavrila" ? "gavrila" : e.kind, x: e.x, y: e.y, t: 0, flip: false });
    burst(e.x, e.y, "#8a4fd8", 14);
    burst(e.x, e.y, "#3a2a4a", 8);
    if (e.kind === "peasant") corpses.push({ x: e.x, y: e.y, t: 0, burning: 0 });
    const nSouls = e.kind === "gotfrid" ? 40 : e.kind === "bonifaciy" ? 20 : e.kind === "gavrila" ? 12 : 1;
    for (let i = 0; i < nSouls; i++) soulsArr.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y + (Math.random() - 0.5) * 40, t: 0 });
    audio.sfx("explosion");
  }

  // ---------- Прокачка ----------
  function buildUpgradePool(): Upgrade[] {
    return [
      { id: "dmg",   name: "Порченый болт",  desc: "+4 урона магии",              icon: "☄", apply: () => { boltDmg += 4; } },
      { id: "rate",  name: "Скверна в крови", desc: "каст на 15% быстрее",         icon: "⚡", apply: () => { boltCdBase *= 0.85; } },
      { id: "cap",   name: "Хор костей",     desc: "+2 скелета максимум",          icon: "💀", apply: () => { skelCap += 2; } },
      { id: "sdmg",  name: "Острые когти",   desc: "+4 урона скелетам",            icon: "🗡", apply: () => { skelDmg += 4; } },
      { id: "shp",   name: "Толстые кости",  desc: "+15 HP скелетам (и текущим)",  icon: "🦴", apply: () => { skelHpMax += 15; for (const s of skeletons) s.hp += 15; } },
      { id: "spd",   name: "Шаг тени",       desc: "+12% скорости бега",           icon: "👣", apply: () => { playerSpeed *= 1.12; } },
      { id: "hp",    name: "Мёртвая плоть",  desc: "+15 макс HP и исцеление",      icon: "🖤", apply: () => { playerMaxHp += 15; player.hp = playerMaxHp; } },
      { id: "altar", name: "Кровавая десятина", desc: "алтарь +30 HP сейчас",      icon: "🩸", apply: () => { altar.hp = Math.min(ALTAR_MAX_HP, altar.hp + 30); } },
      { id: "soul",  name: "Жадный алтарь",  desc: "души лечат алтарь +2",         icon: "🔮", apply: () => { soulHeal += 2; } },
    ];
  }

  function enterUpgrade(): void {
    const pool = buildUpgradePool();
    upgradeChoices = [];
    while (upgradeChoices.length < 3 && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      upgradeChoices.push(pool.splice(i, 1)[0]);
    }
    // передышка: после волны некромант восстанавливает четверть сил
    player.hp = Math.min(playerMaxHp, player.hp + Math.round(playerMaxHp * 0.25));
    state = "upgrade";
    audio.sfx("pickup");
  }

  function pickUpgrade(i: number): void {
    const u = upgradeChoices[i];
    if (!u) return;
    u.apply();
    upgradeChoices = [];
    audio.sfx("ui");
    startNextWave();
    state = "playing";
  }

  // ---------- Логика ----------
  function update(dt: number): void {
    const act = input.actions;
    if (act.has("Tap") && state === "playing" && lastTap.x > window.innerWidth - 76 && lastTap.y < 76) {
      state = "paused";
      act.clear();
      lastTap = { x: -1, y: -1 };
      return;
    }
    const confirm = act.has("Space") || act.has("Tap");
    if (confirm) {
      if (state === "title") { state = "playing"; reset(); audio.startMusic(); }
      else if (state === "won" || state === "lost") { state = "playing"; reset(); }
      else if (state === "paused" && act.has("Tap")) state = "playing";
    }
    if (act.has("Escape")) {
      if (state === "playing") state = "paused";
      else if (state === "paused") state = "playing";
    }
    if (act.has("KeyM")) audio.toggleMute();
    if (state === "upgrade") {
      if (act.has("Digit1")) pickUpgrade(0);
      else if (act.has("Digit2")) pickUpgrade(1);
      else if (act.has("Digit3")) pickUpgrade(2);
      else if (act.has("Tap")) {
        const i = cardAt(lastTap.x, lastTap.y);
        if (i >= 0) pickUpgrade(i);
      }
    }
    act.clear();

    time += dt;
    if (state !== "playing") return;

    if (bannerT > 0) bannerT -= dt;
    if (shake > 0) shake -= dt;
    if (playerHurtFlash > 0) playerHurtFlash -= dt;
    if (hurtCd > 0) hurtCd -= dt;
    if (castT >= 0) {
      castT += dt;
      if (!boltFired && castT >= CAST_FIRE_T) {
        boltFired = true;
        bolts.push({ x: player.x + castX * 30, y: player.y - 40 + castY * 30, vx: castX * BOLT_SPEED, vy: castY * BOLT_SPEED, life: 0, ang: Math.atan2(castY, castX), trail: 0 });
        burst(player.x + castX * 40, player.y - 40 + castY * 40, "#39ff88", 4, 70);
      }
      if (castT > CAST_DUR) castT = -1;
    }

    // --- игрок ---
    player.x += input.moveX * playerSpeed * dt;
    player.y -= input.moveZ * playerSpeed * dt;
    player.x = Math.max(40, Math.min(WORLD - 40, player.x));
    player.y = Math.max(40, Math.min(WORLD - 40, player.y));
    player.hp = Math.min(playerMaxHp, player.hp + 1.2 * dt);

    cam.x += (player.x - cam.x) * Math.min(1, dt * 6);
    cam.y += (player.y - cam.y) * Math.min(1, dt * 6);

    // --- спавн ---
    if (spawnQueue.length > 0) {
      spawnT -= dt;
      if (spawnT <= 0) { spawnT = 0.75; spawnEnemy(spawnQueue.shift()!); }
    } else if (enemies.length === 0 && wave >= 1 && wave <= WAVES.length) {
      waveBreak += dt;
      if (waveBreak > 2.2) {
        waveBreak = 0;
        if (wave === WAVES.length) { state = "won"; audio.sfx("win"); }
        else enterUpgrade();
      }
    }

    // --- болты некроманта ---
    boltCd -= dt;
    if (boltCd <= 0) {
      const t = nearestEnemy(player.x, player.y, BOLT_RANGE);
      if (t) {
        boltCd = boltCdBase;
        const d = Math.max(1, dist(player.x, player.y, t.x, t.y));
        castX = (t.x - player.x) / d; castY = (t.y - player.y) / d;
        castT = 0; boltFired = false; // болт вылетит на кадре выпада посоха
      }
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life += dt; b.trail += dt;
      if (b.trail > 0.025) {
        b.trail = 0;
        particles.push({ x: b.x, y: b.y, vx: -b.vx * 0.05, vy: -b.vy * 0.05, life: 0, max: 0.3, color: "#2bd473", size: 3 + Math.random() * 2 });
      }
      let hit = false;
      for (const e of enemies) {
        if (e.dead) continue;
        const r = (e.kind === "gavrila" || e.kind === "bonifaciy" || e.kind === "gotfrid") ? 60 : 34;
        if (dist(b.x, b.y, e.x, e.y) < r) {
          const n = Math.max(1, Math.hypot(b.vx, b.vy));
          const dmg = e.kind === "guard" ? Math.round(boltDmg * 0.5) : boltDmg; // щит срезает магию
          hurtEnemy(e, dmg, (b.vx / n) * 90, (b.vy / n) * 90);
          burst(b.x, b.y, "#39ff88", 8, 110);
          rings.push({ x: b.x, y: b.y, t: 0, max: 0.22, color: "rgba(57,255,136,", width: 3 });
          audio.sfx("hit");
          hit = true;
          break;
        }
      }
      if (hit || b.life > 1.2) bolts.splice(i, 1);
    }

    // --- враги ---
    for (const e of enemies) {
      if (e.flash > 0) e.flash -= dt;
      e.atkCd -= dt;
      // отброс затухает
      e.x += e.kbX * dt; e.y += e.kbY * dt;
      e.kbX *= 0.85; e.kbY *= 0.85;

      let tx = ALTAR.x, ty = ALTAR.y;
      let target: "altar" | "player" | "skeleton" | "corpse" = "altar";
      let targetSk: Skeleton | null = null;
      let targetCorpse: Corpse | null = null;
      if (e.kind === "hound") { tx = player.x; ty = player.y; target = "player"; }
      else if (e.kind === "torch" && corpses.length > 0) {
        // факельщик охотится за трупами, чтобы сжечь их до воскрешения
        let bd = Infinity;
        for (const c of corpses) {
          const d = dist(e.x, e.y, c.x, c.y);
          if (d < bd) { bd = d; targetCorpse = c; }
        }
        if (targetCorpse) { tx = targetCorpse.x; ty = targetCorpse.y; target = "corpse"; }
      } else {
        let bd = 230;
        for (const s of skeletons) {
          const d = dist(e.x, e.y, s.x, s.y);
          if (d < bd) { bd = d; targetSk = s; }
        }
        if (targetSk) { tx = targetSk.x; ty = targetSk.y; target = "skeleton"; }
      }
      const isBoss = e.kind === "gavrila" || e.kind === "bonifaciy" || e.kind === "gotfrid";
      const d = dist(e.x, e.y, tx, ty);
      const reach = isBoss ? 95 : target === "altar" ? 82 : target === "corpse" ? 50 : 46;

      if (e.atkT >= 0) {
        // анимация атаки: замах -> удар
        e.atkT += dt;
        const strikeAt = e.atkDur * 0.55;
        if (!e.hitDone && e.atkT >= strikeAt) {
          e.hitDone = true;
          if (target === "altar") {
            altar.hp -= e.dmg; shake = Math.max(shake, isBoss ? 0.5 : 0.22);
            burst(ALTAR.x + e.ax * 40, ALTAR.y - 40 + e.ay * 40, "#ff5544", 8);
            rings.push({ x: ALTAR.x, y: ALTAR.y - 30, t: 0, max: 0.3, color: "rgba(255,85,68,", width: 3 });
            audio.sfx("hit");
          } else if (target === "player") {
            player.hp -= e.dmg; playerHurtFlash = 0.3; shake = Math.max(shake, 0.15);
            audio.sfx("hit");
          } else if (target === "corpse" && targetCorpse) {
            // сжигает труп: скелет из него не встанет
            targetCorpse.burning = 1;
            burst(targetCorpse.x, targetCorpse.y, "#ff8830", 16, 130);
            burst(targetCorpse.x, targetCorpse.y, "#ffcc44", 8, 90);
            rings.push({ x: targetCorpse.x, y: targetCorpse.y, t: 0, max: 0.35, color: "rgba(255,136,48,", width: 3 });
            audio.sfx("hit");
          } else if (targetSk) {
            targetSk.hp -= e.dmg; targetSk.flash = 0.12;
            dmgNum(targetSk.x, targetSk.y, e.dmg, "#ffb0a0");
          }
        }
        if (e.atkT >= e.atkDur) { e.atkT = -1; e.atkCd = isBoss ? 1.2 : 0.9; }
        e.moving = false;
      } else if (d > reach) {
        e.moving = true;
        let vx = (tx - e.x) / d, vy = (ty - e.y) / d;
        if (e.kind === "hound") {
          e.zig += dt * 6;
          const s = Math.sin(e.zig) * 0.55;
          const px = -vy, py = vx;
          vx += px * s; vy += py * s;
          const n = Math.hypot(vx, vy); vx /= n; vy /= n;
        }
        e.x += vx * e.speed * dt;
        e.y += vy * e.speed * dt;
      } else if (e.atkCd <= 0) {
        // начало замаха
        e.atkT = 0; e.hitDone = false; e.moving = false;
        e.ax = (tx - e.x) / Math.max(1, d); e.ay = (ty - e.y) / Math.max(1, d);
      } else {
        e.moving = false;
      }

      if (e.kind !== "hound" && hurtCd <= 0 && dist(e.x, e.y, player.x, player.y) < 42) {
        player.hp -= e.dmg; hurtCd = 0.8; playerHurtFlash = 0.3;
        dmgNum(player.x, player.y, e.dmg, "#ff7b6b");
        audio.sfx("hit");
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);

    // --- скелеты ---
    for (const s of skeletons) {
      if (s.flash > 0) s.flash -= dt;
      s.atkCd -= dt;
      if (s.atkT >= 0) { s.atkT += dt; if (s.atkT > 0.3) s.atkT = -1; }
      const t = nearestEnemy(s.x, s.y, 620);
      if (t) {
        const d = dist(s.x, s.y, t.x, t.y);
        if (d > 44) {
          s.moving = true;
          s.x += ((t.x - s.x) / d) * 155 * dt;
          s.y += ((t.y - s.y) / d) * 155 * dt;
        } else if (s.atkCd <= 0) {
          s.moving = false;
          s.atkCd = 0.7;
          s.atkT = 0;
          s.ax = (t.x - s.x) / Math.max(1, d); s.ay = (t.y - s.y) / Math.max(1, d);
          hurtEnemy(t, skelDmg, s.ax * 60, s.ay * 60);
          rings.push({ x: t.x, y: t.y - 30, t: 0, max: 0.16, color: "rgba(230,230,255,", width: 2 });
        }
      } else {
        const d = dist(s.x, s.y, ALTAR.x, ALTAR.y);
        if (d > 160) {
          s.moving = true;
          s.x += ((ALTAR.x - s.x) / d) * 120 * dt;
          s.y += ((ALTAR.y - s.y) / d) * 120 * dt;
        } else {
          s.moving = false;
        }
      }
    }
    for (let i = skeletons.length - 1; i >= 0; i--) {
      if (skeletons[i].hp <= 0) {
        dying.push({ kind: "skeleton", x: skeletons[i].x, y: skeletons[i].y, t: 0, flip: false });
        burst(skeletons[i].x, skeletons[i].y, "#b8b8b8", 10);
        skeletons.splice(i, 1);
      }
    }

    // --- трупы -> скелеты ---
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i];
      if (c.burning > 0) {
        c.burning += dt;
        if (Math.random() < 0.4) {
          particles.push({ x: c.x + (Math.random() - 0.5) * 24, y: c.y - Math.random() * 30, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 40, life: 0, max: 0.5, color: Math.random() < 0.5 ? "#ff8830" : "#666666", size: 3 + Math.random() * 3 });
        }
        if (c.burning > 1.1) corpses.splice(i, 1);
        continue;
      }
      c.t += dt;
      if (c.t >= CORPSE_RAISE_TIME) {
        corpses.splice(i, 1);
        if (skeletons.length < skelCap) {
          skeletons.push({ x: c.x, y: c.y, hp: skelHpMax, atkCd: 0, flash: 0, atkT: -1, ax: 1, ay: 0, moving: false, zig: Math.random() * 10 });
          burst(c.x, c.y, "#b04fe0", 16, 100);
          rings.push({ x: c.x, y: c.y, t: 0, max: 0.4, color: "rgba(176,79,224,", width: 3 });
          audio.sfx("explosion");
        } else {
          burst(c.x, c.y, "#555566", 6, 60);
        }
      }
    }

    // --- души ---
    for (let i = soulsArr.length - 1; i >= 0; i--) {
      const s = soulsArr[i];
      s.t += dt;
      if (s.t > 0.5) {
        const d = dist(s.x, s.y, ALTAR.x, ALTAR.y);
        if (d < 50) {
          soulsArr.splice(i, 1);
          souls++;
          altar.hp = Math.min(ALTAR_MAX_HP, altar.hp + soulHeal);
          player.hp = Math.min(playerMaxHp, player.hp + 1); // некромант подпитывается душами
          burst(ALTAR.x, ALTAR.y - 60, "#55baff", 5, 60);
          audio.sfx("pickup");
          continue;
        }
        const spd = 320 + s.t * 200;
        s.x += ((ALTAR.x - s.x) / d) * spd * dt;
        s.y += ((ALTAR.y - s.y) / d) * spd * dt;
      } else {
        s.y -= 30 * dt;
      }
    }

    // --- частицы / смерти / цифры / кольца ---
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      if (p.life >= p.max) particles.splice(i, 1);
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      dying[i].t += dt;
      if (dying[i].t >= 0.45) dying.splice(i, 1);
    }
    for (let i = dmgNums.length - 1; i >= 0; i--) {
      dmgNums[i].life += dt;
      dmgNums[i].y -= 55 * dt;
      if (dmgNums[i].life > 0.7) dmgNums.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      if (rings[i].t >= rings[i].max) rings.splice(i, 1);
    }

    if (altar.hp <= 0 || player.hp <= 0) {
      state = "lost";
      audio.sfx("lose");
    }
  }

  // геометрия карточек прокачки (общая для рендера и хит-теста)
  function cardRects(vw: number, vh: number): Array<{ x: number; y: number; w: number; h: number }> {
    const cw = Math.min(240, (vw - 60) / 3 - 12);
    const ch = 150;
    const total = cw * 3 + 24;
    const y = vh * 0.42;
    return [0, 1, 2].map((i) => ({ x: vw / 2 - total / 2 + i * (cw + 12), y, w: cw, h: ch }));
  }

  function cardAt(px: number, py: number): number {
    const rects = cardRects(window.innerWidth, window.innerHeight);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return -1;
  }

  // ---------- Рендер ----------
  function drawSprite(key: string, x: number, y: number, h: number, flip = false, bob = 0, rot = 0, squashX = 1, squashY = 1): void {
    const sp = sprites[key];
    if (!sp) return;
    const w = (h * sp.sw) / sp.sh;
    ctx.save();
    ctx.translate(x, y + bob);
    if (rot) ctx.rotate(rot);
    ctx.scale(flip ? -squashX : squashX, squashY);
    ctx.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, -w / 2, -h, w, h);
    ctx.restore();
  }

  // спрайт с белой вспышкой при получении урона
  function drawSpriteFlash(key: string, x: number, y: number, h: number, flip: boolean, bob: number, rot: number, squashX: number, squashY: number): void {
    const sp = sprites[key];
    if (!sp) return;
    const w = (h * sp.sw) / sp.sh;
    ctx.save();
    ctx.translate(x, y + bob);
    if (rot) ctx.rotate(rot);
    ctx.scale(flip ? -squashX : squashX, squashY);
    ctx.filter = "brightness(3)";
    ctx.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, -w / 2, -h, w, h);
    ctx.restore();
    ctx.filter = "none";
  }

  function drawShadow(x: number, y: number, r: number): void {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBar(x: number, y: number, w: number, h: number, ratio: number, color: string, back = "#1a1a24"): void {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function render(): void {
    const W = canvas.width, H = canvas.height;
    const scale = Math.min(window.devicePixelRatio, 2);
    const vw = W / scale, vh = H / scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, W, H);

    if (!loaded) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = "#b9a7e0";
      ctx.font = "24px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Загрузка...", vw / 2, vh / 2);
      return;
    }

    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 26 : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 26 : 0;
    const camX = Math.max(vw / 2, Math.min(WORLD - vw / 2, cam.x)) + shakeX;
    const camY = Math.max(vh / 2, Math.min(WORLD - vh / 2, cam.y)) + shakeY;
    ctx.setTransform(scale, 0, 0, scale, -camX * scale + (W / 2), -camY * scale + (H / 2));

    // --- пол ---
    const floor = sprites.floor;
    if (floor) {
      const ts = 256;
      const x0 = Math.floor((camX - vw / 2) / ts) * ts;
      const y0 = Math.floor((camY - vh / 2) / ts) * ts;
      for (let y = y0; y < camY + vh / 2 + ts; y += ts) {
        for (let x = x0; x < camX + vw / 2 + ts; x += ts) {
          ctx.drawImage(floor.img, Math.max(0, Math.min(WORLD - ts, x)), Math.max(0, Math.min(WORLD - ts, y)), ts, ts);
        }
      }
    }
    ctx.strokeStyle = "rgba(90,60,140,0.5)";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, WORLD, WORLD);

    ctx.fillStyle = "rgba(8,10,22,0.52)";
    ctx.fillRect(camX - vw / 2 - 10, camY - vh / 2 - 10, vw + 20, vh + 20);

    // --- трупы ---
    for (const c of corpses) {
      const a = c.burning > 0 ? Math.max(0.15, 0.9 - c.burning * 0.5) : Math.max(0.25, 1 - c.t / CORPSE_RAISE_TIME);
      ctx.save();
      ctx.globalAlpha = a;
      drawSprite("peasant", c.x, c.y, 40, false, 0, Math.PI / 2);
      ctx.restore();
      if (c.burning > 0) {
        const g = ctx.createRadialGradient(c.x, c.y - 10, 2, c.x, c.y - 10, 34);
        g.addColorStop(0, "rgba(255,140,40,0.45)");
        g.addColorStop(1, "rgba(255,140,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(c.x - 34, c.y - 44, 68, 68);
      } else {
        ctx.fillStyle = "rgba(176,79,224,0.7)";
        ctx.fillRect(c.x - 20, c.y + 6, 40 * (c.t / CORPSE_RAISE_TIME), 3);
      }
    }

    // --- алтарь ---
    drawShadow(ALTAR.x, ALTAR.y + 4, 95);
    const altarBob = Math.sin(time * 2) * 3;
    drawSprite("altar", ALTAR.x, ALTAR.y + altarBob, 190);
    const glow = ctx.createRadialGradient(ALTAR.x, ALTAR.y - 60, 10, ALTAR.x, ALTAR.y - 60, 150);
    glow.addColorStop(0, "rgba(85,186,255,0.25)");
    glow.addColorStop(1, "rgba(85,186,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(ALTAR.x - 150, ALTAR.y - 210, 300, 300);

    // --- души ---
    for (const s of soulsArr) {
      const r = 6 + Math.sin(time * 10 + s.x) * 1.5;
      const g2 = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, r * 3);
      g2.addColorStop(0, "rgba(120,210,255,0.9)");
      g2.addColorStop(1, "rgba(120,210,255,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(s.x - r * 3, s.y - r * 3, r * 6, r * 6);
      ctx.fillStyle = "#9fdcff";
      ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
    }

    // --- умирающие ---
    for (const d of dying) {
      const t = d.t / 0.45;
      const h = (d.kind === "gavrila" || d.kind === "bonifaciy" || d.kind === "gotfrid") ? 200
        : d.kind === "hound" ? 75 : d.kind === "skeleton" ? 95 : d.kind === "guard" ? 110 : 100;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      drawSprite(d.kind, d.x, d.y + t * 12, h * (1 - t * 0.3), d.flip, 0, t * 1.6);
      ctx.restore();
    }

    // --- сущности (сортировка по y) ---
    type Ent = { y: number; draw: () => void };
    const ents: Ent[] = [];

    for (const e of enemies) {
      ents.push({ y: e.y, draw: () => {
        const isBoss = e.kind === "gavrila" || e.kind === "bonifaciy" || e.kind === "gotfrid";
        const A = ANIMS[e.kind];
        const h = A.h;
        drawShadow(e.x, e.y + 2, isBoss ? 70 : 32);
        const flip = e.x > (e.kind === "hound" ? player.x : ALTAR.x);
        let key: string;
        let hDraw = h;
        if (e.atkT >= 0) {
          key = `${A.attack}_${Math.min(3, Math.floor((e.atkT / e.atkDur) * 4))}`;
          hDraw = h * A.atkScale; // холст выше из-за замаха — компенсируем размер тела
        } else if (e.moving) {
          key = `${A.walk}_${Math.floor(time * A.fps + e.zig) % 4}`;
        } else {
          key = `${A.walk}_0`;
        }
        if (!sprites[key]) key = e.kind;
        drawSprite(key, e.x, e.y, hDraw, flip);
        if (e.flash > 0) drawSpriteFlash(key, e.x, e.y, hDraw, flip, 0, 0, 1, 1);
        if (e.hp < e.maxHp) {
          drawBar(e.x - 28, e.y - h - 10, 56, 5, e.hp / e.maxHp, isBoss ? "#ffb020" : "#d84040");
        }
      }});
    }
    for (const s of skeletons) {
      ents.push({ y: s.y, draw: () => {
        drawShadow(s.x, s.y + 2, 28);
        const h = 95;
        let key: string;
        let hDraw = h;
        if (s.atkT >= 0) {
          key = "skeleton_attack_" + Math.min(3, Math.floor((s.atkT / 0.3) * 4));
          hDraw = h * 1.16; // холст выше из-за замаха мечом
        } else if (s.moving) {
          key = "skeleton_walk_" + (Math.floor(time * 9 + s.zig) % 4);
        } else {
          key = "skeleton_walk_0";
        }
        if (!sprites[key]) key = "skeleton";
        const flip = s.ax < 0;
        drawSprite(key, s.x, s.y, hDraw, flip);
        if (s.flash > 0) drawSpriteFlash(key, s.x, s.y, hDraw, flip, 0, 0, 1, 1);
        drawBar(s.x - 22, s.y - h - 10, 44, 4, s.hp / skelHpMax, "#b04fe0");
      }});
    }
    ents.push({ y: player.y, draw: () => {
      drawShadow(player.x, player.y + 2, 34);
      const moving = input.moveX !== 0 || input.moveZ !== 0;
      // выбор кадра: каст > ходьба > стойка
      let key = "necro_walk_0";
      if (castT >= 0) {
        key = "necro_cast_" + Math.min(3, Math.floor((castT / CAST_DUR) * 4));
      } else if (moving) {
        key = "necro_walk_" + (Math.floor(time * 9) % 4);
      }
      if (!sprites[key]) key = "necromancer";
      const flip = castT >= 0 ? castX < 0 : input.moveX < 0;
      const bob = castT < 0 && !moving ? Math.sin(time * 3) * 2 : 0; // дыхание в стойке
      drawSprite(key, player.x, player.y, 125, flip, bob);
      // вспышка на посохе в момент вылета болта
      if (castT >= CAST_FIRE_T && castT < CAST_FIRE_T + 0.12) {
        const gx = player.x + castX * 55, gy = player.y - 75 + castY * 55;
        const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, 26);
        g.addColorStop(0, "rgba(150,255,190,0.9)");
        g.addColorStop(1, "rgba(57,255,136,0)");
        ctx.fillStyle = g;
        ctx.fillRect(gx - 26, gy - 26, 52, 52);
      }
    }});

    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();

    // --- болты ---
    for (const b of bolts) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang);
      const g3 = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
      g3.addColorStop(0, "rgba(120,255,170,0.9)");
      g3.addColorStop(1, "rgba(57,255,136,0)");
      ctx.fillStyle = g3;
      ctx.fillRect(-22, -22, 44, 44);
      ctx.fillStyle = "#baffd8";
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#eafff3";
      ctx.beginPath();
      ctx.ellipse(4, 0, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- кольца ударов ---
    for (const r of rings) {
      const k = r.t / r.max;
      ctx.strokeStyle = r.color + (1 - k) + ")";
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 8 + k * 34, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- частицы ---
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // --- цифры урона ---
    ctx.textAlign = "center";
    for (const d of dmgNums) {
      ctx.globalAlpha = Math.max(0, 1 - d.life / 0.7);
      ctx.font = "bold 17px monospace";
      ctx.fillStyle = "#111";
      ctx.fillText(d.txt, d.x + 1, d.y + 1);
      ctx.fillStyle = d.color;
      ctx.fillText(d.txt, d.x, d.y);
    }
    ctx.globalAlpha = 1;

    // ---------- HUD ----------
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.textAlign = "left";

    const vig = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(4,4,12,0.6)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, vw, vh);

    // красная виньетка при уроне по игроку
    if (playerHurtFlash > 0) {
      const hv = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      hv.addColorStop(0, "rgba(255,40,40,0)");
      hv.addColorStop(1, `rgba(255,30,30,${Math.min(0.5, playerHurtFlash * 1.6)})`);
      ctx.fillStyle = hv;
      ctx.fillRect(0, 0, vw, vh);
    }

    if (state !== "title") {
      const bw = Math.min(420, vw - 40);
      drawBar(vw / 2 - bw / 2, 16, bw, 18, altar.hp / ALTAR_MAX_HP, "#55baff");
      ctx.fillStyle = "#dff2ff";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`АЛТАРЬ  ${Math.max(0, Math.ceil(altar.hp))} / ${ALTAR_MAX_HP}`, vw / 2, 30);

      ctx.textAlign = "left";
      ctx.font = "bold 18px monospace";
      ctx.fillStyle = "#e8ddff";
      ctx.fillText(`Волна ${Math.min(wave, WAVES.length)} / ${WAVES.length}`, 16, 32);
      ctx.fillStyle = "#9fdcff";
      ctx.fillText(`Души: ${souls}`, 16, 56);
      ctx.fillStyle = "#d8a9ff";
      ctx.fillText(`Скелеты: ${skeletons.length}/${skelCap}`, 16, 80);

      drawBar(16, vh - 34, 220, 16, player.hp / playerMaxHp, "#39ff88");
      ctx.fillStyle = "#d9ffe9";
      ctx.font = "bold 12px monospace";
      ctx.fillText(`НЕКРОМАНТ  ${Math.max(0, Math.ceil(player.hp))}`, 20, vh - 22);

      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(230,220,255,0.55)";
      ctx.font = "12px monospace";
      ctx.fillText("WASD / стик слева — движение · магия бьёт сама · трупы встают скелетами · Esc — пауза · M — звук", vw / 2, vh - 14);

      if (state === "playing") {
        ctx.fillStyle = "rgba(40,36,60,0.75)";
        ctx.fillRect(vw - 60, 14, 44, 44);
        ctx.strokeStyle = "rgba(180,150,255,0.6)";
        ctx.lineWidth = 2;
        ctx.strokeRect(vw - 60, 14, 44, 44);
        ctx.fillStyle = "#cfc0f5";
        ctx.fillRect(vw - 46, 25, 7, 22);
        ctx.fillRect(vw - 34, 25, 7, 22);
      }
    }

    if (bannerT > 0 && state === "playing") {
      ctx.textAlign = "center";
      ctx.globalAlpha = Math.min(1, bannerT);
      ctx.fillStyle = "#efe6ff";
      ctx.font = "bold 34px monospace";
      ctx.fillText(banner, vw / 2, vh * 0.3);
      ctx.globalAlpha = 1;
    }

    if (state === "title") {
      ctx.fillStyle = "rgba(6,6,12,0.82)";
      ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = "center";
      ctx.fillStyle = "#c99aff";
      ctx.font = "bold 42px monospace";
      ctx.fillText("НЕКРОМАНТ", vw / 2, vh * 0.3);
      ctx.fillStyle = "#8fd0ff";
      ctx.font = "bold 22px monospace";
      ctx.fillText("Оборона Алтаря", vw / 2, vh * 0.3 + 40);
      ctx.fillStyle = "#b9b3cc";
      ctx.font = "15px monospace";
      ctx.fillText("Толпы «праведников» идут сжечь твоё логово.", vw / 2, vh * 0.48);
      ctx.fillText("Убивай — их тела встанут на твою защиту, души укрепят Алтарь.", vw / 2, vh * 0.48 + 26);
      ctx.fillText("Переживи 15 волн — до финального босса.", vw / 2, vh * 0.48 + 52);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px monospace";
      ctx.fillText("ПРОБЕЛ / ТАП — начать", vw / 2, vh * 0.66);
    } else if (state === "upgrade") {
      ctx.fillStyle = "rgba(10,6,18,0.88)";
      ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = "center";
      ctx.fillStyle = "#c99aff";
      ctx.font = "bold 30px monospace";
      ctx.fillText("КНИГА МУТАЦИЙ", vw / 2, vh * 0.2);
      ctx.fillStyle = "#b9b3cc";
      ctx.font = "15px monospace";
      ctx.fillText(`Волна ${wave} отбита. Души поют — выбери одно усиление.`, vw / 2, vh * 0.2 + 30);
      const rects = cardRects(vw, vh);
      for (let i = 0; i < upgradeChoices.length; i++) {
        const r = rects[i];
        const u = upgradeChoices[i];
        ctx.fillStyle = "rgba(38,28,58,0.95)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = "#8a5fd0";
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = "#8a5fd0";
        ctx.fillRect(r.x, r.y, r.w, 4);
        ctx.fillStyle = "#e8ddff";
        ctx.font = "bold 26px monospace";
        ctx.fillText(u.icon, r.x + r.w / 2, r.y + 40);
        ctx.font = "bold 15px monospace";
        ctx.fillStyle = "#efe6ff";
        ctx.fillText(u.name, r.x + r.w / 2, r.y + 68);
        ctx.font = "13px monospace";
        ctx.fillStyle = "#b9b3cc";
        ctx.fillText(u.desc, r.x + r.w / 2, r.y + 92);
        ctx.fillStyle = "#7a6a99";
        ctx.font = "12px monospace";
        ctx.fillText(`[ ${i + 1} ]`, r.x + r.w / 2, r.y + r.h - 14);
      }
      ctx.fillStyle = "rgba(230,220,255,0.55)";
      ctx.font = "13px monospace";
      ctx.fillText("клавиши 1–3 или тап по карточке", vw / 2, vh * 0.42 + 180);
    } else if (state === "paused") {
      ctx.fillStyle = "rgba(6,6,12,0.7)";
      ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = "center";
      ctx.fillStyle = "#efe6ff";
      ctx.font = "bold 34px monospace";
      ctx.fillText("ПАУЗА", vw / 2, vh / 2 - 10);
      ctx.font = "16px monospace";
      ctx.fillText("Esc / тап — продолжить", vw / 2, vh / 2 + 26);
    } else if (state === "won") {
      ctx.fillStyle = "rgba(8,10,8,0.85)";
      ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = "center";
      ctx.fillStyle = "#9dffb0";
      ctx.font = "bold 36px monospace";
      ctx.fillText("КЛАДБИЩЕ ОТСТОЯНО!", vw / 2, vh * 0.4);
      ctx.fillStyle = "#cfe8d8";
      ctx.font = "16px monospace";
      ctx.fillText(`Собрано душ: ${souls}. Деревня больше не сунется... пока.`, vw / 2, vh * 0.4 + 36);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px monospace";
      ctx.fillText("ПРОБЕЛ / ТАП — сыграть ещё", vw / 2, vh * 0.58);
    } else if (state === "lost") {
      ctx.fillStyle = "rgba(12,5,5,0.85)";
      ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff7b6b";
      ctx.font = "bold 36px monospace";
      ctx.fillText(altar.hp <= 0 ? "АЛТАРЬ РАЗРУШЕН" : "НЕКРОМАНТ ПАЛ", vw / 2, vh * 0.4);
      ctx.fillStyle = "#e0c8c4";
      ctx.font = "16px monospace";
      ctx.fillText(`Дошёл до волны ${Math.min(wave, WAVES.length)}. Души: ${souls}.`, vw / 2, vh * 0.4 + 36);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px monospace";
      ctx.fillText("ПРОБЕЛ / ТАП — попробовать снова", vw / 2, vh * 0.58);
    }

    window.__GAME_READY__ = true;
  }

  const loop = new GameLoop({ update, render });
  loop.start();

  window.__gameProbe = () => ({ x: player.x, y: 0, z: player.y, state, wave, playerHp: player.hp, altarHp: altar.hp, enemies: enemies.length, skeletons: skeletons.length });

  session = {
    dispose: () => {
      loop.stop();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onTap);
      input.dispose();
      audio.dispose();
      delete window.__gameProbe;
      window.__GAME_READY__ = false;
    },
  };
}

export function stopGame(): void {
  session?.dispose();
  session = null;
}
