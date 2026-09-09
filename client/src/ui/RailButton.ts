import { injectHudStyles } from './hudStyles.js';

/**
 * One tile on the left rail.
 *
 * A gradient square with a chunky dark border, an icon, a label overlapping
 * its bottom edge and a red badge when there is something to collect - the
 * shape every button in the reference art has.
 *
 * It is presentation only. A tile knows how to look available and how to look
 * locked; whether it IS available is decided by replicated server state and
 * passed in.
 */
export class RailButton {
  readonly root: HTMLButtonElement;

  private readonly badge: HTMLSpanElement;

  constructor(
    parent: HTMLElement,
    options: {
      /** Modifier suffix: `aoe-tile--<variant>` supplies the gradient. */
      readonly variant: string;
      readonly label: string;
      /** Inline SVG markup. */
      readonly icon: string;
      readonly onClick: () => void;
    },
  ) {
    injectHudStyles();

    this.root = document.createElement('button');
    this.root.type = 'button';
    this.root.className = `aoe-tile aoe-tile--${options.variant}`;
    this.root.setAttribute('aria-label', options.label);
    this.root.innerHTML = options.icon;

    const label = document.createElement('span');
    label.className = 'aoe-tile__label aoe-font aoe-outline';
    label.textContent = options.label;
    this.root.appendChild(label);

    this.badge = document.createElement('span');
    this.badge.className = 'aoe-tile__badge aoe-font';
    this.badge.textContent = '!';
    this.root.appendChild(this.badge);

    this.root.addEventListener('click', (event) => {
      event.stopPropagation();
      options.onClick();
    });

    parent.appendChild(this.root);
  }

  /**
   * Fire this tile exactly as a click would.
   *
   * The keyboard shortcuts go through here rather than calling the underlying
   * action, so a key and a click are literally the same code path - including
   * the tile's own focus and active styling, which a direct call would skip.
   */
  press(): void {
    this.root.click();
  }

  /**
   * @param ready   show the badge - something can be done right now
   * @param locked  dim the tile - nothing can be done yet
   */
  setState(ready: boolean, locked = false): void {
    this.root.classList.toggle('aoe-tile--ready', ready);
    this.root.classList.toggle('aoe-tile--locked', locked);
  }

  dispose(): void {
    this.root.remove();
  }
}
