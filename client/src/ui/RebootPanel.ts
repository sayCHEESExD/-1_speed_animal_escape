import { nextRebootTier, rebootMultiplier } from '@animal/shared';
import { Panel } from './Panel.js';

/**
 * The reboot confirmation.
 *
 * States plainly what a reboot costs and what it grants, because it is the one
 * irreversible button in the game: it resets the level curve. What it does NOT
 * touch is spelled out too - Wins, animals and trails are permanent, and a
 * player who does not know that will never press it.
 *
 * The button only ever ASKS. Eligibility is decided by the server from its own
 * level and reboot count, and this panel's enabled state is a mirror of the
 * replicated figures rather than a second opinion about them.
 */
export class RebootPanel extends Panel {
  private readonly note: HTMLParagraphElement;
  private readonly action: HTMLButtonElement;

  private level = 1;
  private reboots = 0;

  constructor(parent: HTMLElement, onReboot: () => void) {
    super(parent, 'reboot', 'Reboot');

    this.note = document.createElement('p');
    this.note.className = 'aoe-panel__note';

    this.action = document.createElement('button');
    this.action.type = 'button';
    this.action.className = 'aoe-action aoe-font';
    this.action.textContent = 'REBOOT';
    this.action.addEventListener('click', () => {
      if (this.action.disabled) return;
      onReboot();
      this.setOpen(false);
    });

    this.body.append(this.note, this.action);
    this.render();
  }

  /** Mirror the replicated progression. */
  setProgress(level: number, reboots: number): void {
    if (level === this.level && reboots === this.reboots) return;
    this.level = level;
    this.reboots = reboots;
    this.render();
  }

  /** True when the server would accept a reboot right now. */
  get isEligible(): boolean {
    return this.level >= nextRebootTier(this.reboots).requiredLevel;
  }

  protected override onOpened(): void {
    this.render();
  }

  private render(): void {
    const tier = nextRebootTier(this.reboots);
    const eligible = this.isEligible;

    this.note.innerHTML =
      `<b>Reboot ${tier.index}</b><br>` +
      `Requires <b>Level ${tier.requiredLevel}</b> &mdash; you are Level ${this.level}.<br><br>` +
      `Rebooting resets your Speed and Level, and permanently multiplies all ` +
      `your Speed by <b>x${tier.multiplier}</b> ` +
      `(currently x${rebootMultiplier(this.reboots)}).<br><br>` +
      `Your <b>Wins, animals and trails are kept</b>.`;

    this.action.disabled = !eligible;
    this.action.textContent = eligible
      ? `REBOOT → x${tier.multiplier}`
      : `LEVEL ${tier.requiredLevel} REQUIRED`;
  }
}
