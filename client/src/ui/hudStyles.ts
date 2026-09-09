/**
 * One stylesheet for the whole HUD, injected on first use.
 *
 * Every panel and button in the game shares these rules, so the rail, the win
 * counter and the two shop panels cannot drift apart visually. The look is
 * taken from the reference art: heavy white display type with a thick dark
 * rim, saturated gradient tiles with a chunky border, and a red badge when
 * something is waiting to be collected.
 */
let injected = false;

export const injectHudStyles = (): void => {
  if (injected) return;
  injected = true;

  const style = document.createElement('style');
  style.textContent = `
:root {
  /* ONE number scales the whole left rail, so the column grows together. */
  --aoe-rail: 78px;
  --aoe-ink: #12181f;
}

.aoe-font {
  font-family: "Arial Black", "Arial Bold", Arial, system-ui, sans-serif;
}

/*
 * The chunky dark rim on every figure. Eight offsets plus a soft drop: a
 * -webkit-text-stroke would be one declaration, but it thins badly at small
 * sizes on some platforms and this reads identically everywhere.
 */
.aoe-outline {
  color: #fff;
  text-shadow:
    3px 0 0 var(--aoe-ink), -3px 0 0 var(--aoe-ink),
    0 3px 0 var(--aoe-ink), 0 -3px 0 var(--aoe-ink),
    2px 2px 0 var(--aoe-ink), -2px 2px 0 var(--aoe-ink),
    2px -2px 0 var(--aoe-ink), -2px -2px 0 var(--aoe-ink),
    0 5px 9px rgba(0, 0, 0, 0.45);
}

/* ---- Wins, upper centre ------------------------------------------------- */
.aoe-wins {
  position: fixed;
  top: max(10px, env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: none;
  user-select: none;
  z-index: 22;
}
.aoe-wins__icon {
  width: clamp(32px, 3.6vw, 50px);
  height: clamp(32px, 3.6vw, 50px);
}
.aoe-wins__icon .aoe-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.45));
}
.aoe-wins__value {
  font-size: clamp(22px, 3vw, 40px);
  line-height: 1;
  /* Orange, as the reference art has it - the one warm figure on screen. */
  color: #ff9d1f;
  text-shadow:
    3px 0 0 #fff, -3px 0 0 #fff, 0 3px 0 #fff, 0 -3px 0 #fff,
    2px 2px 0 #fff, -2px 2px 0 #fff, 2px -2px 0 #fff, -2px -2px 0 #fff,
    0 6px 10px rgba(0, 0, 0, 0.5);
}
.aoe-wins--pop .aoe-wins__value { animation: aoe-pop 520ms ease-out; }
@keyframes aoe-pop {
  0% { transform: scale(1); }
  35% { transform: scale(1.22); }
  100% { transform: scale(1); }
}

/* ---- Left rail ---------------------------------------------------------- */
.aoe-rail {
  position: fixed;
  left: max(10px, env(safe-area-inset-left, 0px));
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  z-index: 21;
  user-select: none;
}
.aoe-tile {
  position: relative;
  width: var(--aoe-rail);
  height: var(--aoe-rail);
  border: 4px solid var(--aoe-ink);
  border-radius: 20px;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.38);
  transition: transform 110ms ease;
}
.aoe-tile:hover { transform: scale(1.06); }
.aoe-tile:active { transform: scale(0.97); }
.aoe-tile .aoe-icon {
  width: 74%;
  height: 74%;
  object-fit: contain;
  /* The art carries its own outline, so it needs a drop shadow rather than a
   * stroke to lift it off the gradient behind it. */
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.35));
  pointer-events: none;
}
/* The label sits UNDER the tile, overlapping its bottom edge, as in the art. */
.aoe-tile__label {
  position: absolute;
  left: 50%;
  bottom: -9px;
  transform: translateX(-50%);
  font-size: clamp(11px, 1.15vw, 15px);
  white-space: nowrap;
  pointer-events: none;
}
/* The red "!" badge: something is available. */
.aoe-tile__badge {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 24px;
  height: 24px;
  border: 3px solid var(--aoe-ink);
  border-radius: 50%;
  background: #f5363f;
  color: #fff;
  font-size: 15px;
  line-height: 18px;
  text-align: center;
  display: none;
}
.aoe-tile--ready .aoe-tile__badge { display: block; }
.aoe-tile--locked { filter: saturate(0.45) brightness(0.78); }

.aoe-tile--reboot {
  background: linear-gradient(160deg, #ff5ff0 0%, #b23bff 55%, #7a1fd6 100%);
}
.aoe-tile--trail {
  background: linear-gradient(160deg, #6de6ff 0%, #2aa8f5 55%, #1670d0 100%);
}

/* ---- Panels ------------------------------------------------------------- */
.aoe-panel {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(6, 10, 18, 0.55);
  z-index: 40;
}
.aoe-panel[hidden] { display: none; }
.aoe-panel__box {
  width: min(560px, 92vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  border: 5px solid var(--aoe-ink);
  border-radius: 22px;
  background: #f2f5f8;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.aoe-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  color: #fff;
  font-size: 22px;
}
.aoe-panel--reboot .aoe-panel__head {
  background: linear-gradient(90deg, #b23bff, #7a1fd6);
}
.aoe-panel--trail .aoe-panel__head {
  background: linear-gradient(90deg, #2aa8f5, #1670d0);
}
.aoe-panel__close {
  border: 3px solid var(--aoe-ink);
  border-radius: 12px;
  background: #f5363f;
  color: #fff;
  width: 34px;
  height: 34px;
  font-size: 17px;
  cursor: pointer;
}
.aoe-panel__body {
  padding: 14px 16px 18px;
  overflow-y: auto;
  color: #16202b;
  font-family: system-ui, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
}
.aoe-panel__note { margin-bottom: 12px; line-height: 1.5; }
.aoe-panel__note b { font-size: 16px; }

.aoe-action {
  width: 100%;
  padding: 13px;
  border: 4px solid var(--aoe-ink);
  border-radius: 16px;
  background: linear-gradient(180deg, #58e06a, #2fae42);
  color: #fff;
  font-size: 19px;
  cursor: pointer;
}
.aoe-action:disabled {
  background: linear-gradient(180deg, #b9c2cc, #93a0ad);
  cursor: not-allowed;
}

/* ---- Shop rows ---------------------------------------------------------- */
.aoe-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 11px;
  margin-bottom: 8px;
  border: 3px solid var(--aoe-ink);
  border-radius: 14px;
  background: #fff;
}
.aoe-row--owned { background: #eafbe9; }
.aoe-row--equipped { background: #dff3ff; box-shadow: inset 0 0 0 3px #2aa8f5; }
.aoe-row__swatch {
  width: 30px;
  height: 30px;
  border: 3px solid var(--aoe-ink);
  border-radius: 9px;
  flex: none;
}
.aoe-row__text { flex: 1; min-width: 0; }
.aoe-row__name { font-weight: 800; }
.aoe-row__meta { opacity: 0.72; font-size: 12px; }
.aoe-row__buy {
  border: 3px solid var(--aoe-ink);
  border-radius: 12px;
  padding: 8px 13px;
  background: linear-gradient(180deg, #ffd54a, #f0a91f);
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
}
.aoe-row__buy:disabled {
  background: linear-gradient(180deg, #cfd6dd, #aab4bf);
  cursor: not-allowed;
}

/* Touch controls own the bottom corners; the rail lifts clear of them. */
body.aoe-touch-mode .aoe-rail { --aoe-rail: 62px; }

@media (prefers-reduced-motion: reduce) {
  .aoe-tile, .aoe-wins--pop .aoe-wins__value { transition: none; animation: none; }
}
`;
  document.head.appendChild(style);
};

/**
 * The HUD icons, as supplied in `assets/ui/`.
 *
 * Served straight from the repo-level assets folder through Vite's publicDir,
 * exactly as the player model is - so there is no duplicate copy inside the
 * client workspace. They are the artwork from the reference screenshots, which
 * is why they are images rather than the hand-drawn SVGs they replaced: a
 * traced approximation of a piece of art you already have is a worse version
 * of it.
 *
 * `alt` is deliberately empty - each one sits inside a control that already
 * carries its own accessible name.
 */
const icon = (file: string): string =>
  `<img class="aoe-icon" src="/ui/${file}" alt="" draggable="false">`;

export const ICONS = {
  trophy: icon('trophy.png'),
  reboot: icon('rebirth.png'),
  trail: icon('trail.png'),
} as const;
