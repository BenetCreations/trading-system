/**
 * Shared button looks from the Positions tab.
 * Lavender: outline in highlight; hover fills highlight with white text.
 * BW: neutral bordered chrome; hover tightens contrast on the border.
 */
export const buttonLavender =
  'border transition-colors bg-[var(--color-bg-card)] border-[var(--color-highlight)] text-[var(--color-highlight)] hover:bg-[var(--color-highlight)] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-bg-card)] disabled:hover:text-[var(--color-highlight)]';

export const buttonBw =
  'bg-[var(--color-bg-card)] border border-[var(--color-accent)] transition-colors hover:border-[var(--color-text-muted)] disabled:opacity-50 disabled:cursor-not-allowed';
