import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { Card, GameAssets } from '@cardtable2/shared';
import {
  LoadPickerModal,
  type LoadPickerSelectHandler,
} from './LoadPickerModal';
import {
  FIXTURE_LOADABLES,
  fixtureResolveDerivedItems,
} from './LoadPickerModal.fixture';

// `use-image` is consumed transitively via CardPreview when the popover
// renders. Default-mock it so the image always reports loaded — avoids
// jsdom Image() flakiness and keeps tests deterministic.
vi.mock('use-image', () => ({
  default: vi.fn(() => [{ width: 300, height: 400 }, 'loaded']),
}));

// Stub matchMedia. Default to hover-capable (desktop) to keep most tests
// on the popover branch; specific tests override to false to drive the
// touch / modal branch. Vitest jsdom doesn't ship matchMedia.
function installMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(), // legacy
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  installMatchMedia(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Build a minimal GameAssets with the eight fixture cards present so the
 * eye-icon branch can resolve images. We intentionally do NOT supply the
 * full ct-pack data — `CardPreview` is happy with a `card.face` URL and
 * the orientation lookup falls back to portrait.
 */
function makeGameAssets(): GameAssets {
  const cards: Record<string, Card> = {};
  const codes = [
    'spider-man',
    'iron-man',
    'cap',
    'black-widow',
    'thor',
    'hulk',
    'strange',
    'wasp',
  ];
  for (const code of codes) {
    cards[code] = {
      name: code,
      type: 'hero',
      face: `https://example/${code}.png`,
    };
  }
  return {
    packs: [],
    cardTypes: { hero: { back: 'https://example/back.png' } },
    cards,
    cardSets: {},
    tokens: {},
    counters: {},
    mats: {},
    tokenTypes: {},
    statusTypes: {},
    modifierStats: {},
    iconTypes: {},
    orientationRules: [],
  };
}

/**
 * Helper: render the picker open with the standard fixture and a fresh
 * spy.  Returns the spy plus the userEvent instance so each test stays
 * compact.
 */
function renderPicker(
  overrides: Partial<React.ComponentProps<typeof LoadPickerModal>> = {},
) {
  // Typed spies — keeps lint's no-unsafe-* rules happy when we read
  // back .mock.calls.  Without the explicit type the destructured
  // tuple comes through as `any[]`.
  const onSelectItem = vi.fn<LoadPickerSelectHandler>();
  const onClose = vi.fn<() => void>();
  const utils = render(
    <LoadPickerModal
      open={true}
      onClose={onClose}
      loadables={FIXTURE_LOADABLES}
      onSelectItem={onSelectItem}
      resolveDerivedItems={fixtureResolveDerivedItems}
      {...overrides}
    />,
  );
  return { onSelectItem, onClose, user: userEvent.setup(), ...utils };
}

describe('LoadPickerModal', () => {
  it('renders the type list at step 1', () => {
    renderPicker();
    expect(
      screen.getByRole('dialog', { name: /choose what to load/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Scenario')).toBeInTheDocument();
    expect(screen.getByText('Deck (from MarvelCDB)')).toBeInTheDocument();
    expect(screen.getByText('Single Card')).toBeInTheDocument();
  });

  it('does not render the additive/replace mode badge in step 1 (ct-i4d)', () => {
    renderPicker();
    // Mode badge previously rendered the literal text 'additive' or
    // 'replace' as plumbing detail — now removed.
    expect(screen.queryByText(/^additive$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^replace$/i)).not.toBeInTheDocument();
  });

  it('clicking a static type shows its items at step 2', async () => {
    const { user } = renderPicker();
    await user.click(screen.getByText('Scenario'));

    // Items from FIXTURE_LOADABLES[0].source.items
    expect(screen.getByText('Rhino')).toBeInTheDocument();
    expect(screen.getByText('Klaw')).toBeInTheDocument();
    expect(screen.getByText('Ultron')).toBeInTheDocument();
    // Search input present
    expect(screen.getByLabelText('Search items')).toBeInTheDocument();
  });

  it('search filters items at step 2', async () => {
    const { user } = renderPicker();
    await user.click(screen.getByText('Single Card'));

    // 8 derived cards in fixture
    expect(screen.getByText('Spider-Man')).toBeInTheDocument();
    expect(screen.getByText('Hulk')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search items'), 'spider');

    expect(screen.getByText('Spider-Man')).toBeInTheDocument();
    expect(screen.queryByText('Hulk')).not.toBeInTheDocument();
    expect(screen.queryByText('Captain America')).not.toBeInTheDocument();
  });

  it('shows empty-match state when search yields nothing', async () => {
    const { user } = renderPicker();
    await user.click(screen.getByText('Scenario'));

    await user.type(screen.getByLabelText('Search items'), 'zzznomatch');

    expect(screen.getByText('No items match')).toBeInTheDocument();
  });

  it('auto-fires for provider-source types and closes the modal (ct-yj2)', async () => {
    const { onSelectItem, onClose, user } = renderPicker();
    await user.click(screen.getByText('Deck (from MarvelCDB)'));

    // No intermediate "Run import…" UI is rendered.
    expect(
      screen.queryByRole('button', { name: 'Run import…' }),
    ).not.toBeInTheDocument();

    // Selection fired with a null item; modal asked to close.
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    const [entry, item] = onSelectItem.mock.calls[0];
    expect(entry.type).toBe('deck');
    expect(item).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it('auto-fires for provider-source presetType without rendering action UI (ct-yj2)', () => {
    const onSelectItem = vi.fn<LoadPickerSelectHandler>();
    const onClose = vi.fn<() => void>();
    render(
      <LoadPickerModal
        open={true}
        onClose={onClose}
        loadables={FIXTURE_LOADABLES}
        presetType="deck"
        onSelectItem={onSelectItem}
        resolveDerivedItems={fixtureResolveDerivedItems}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Run import…' }),
    ).not.toBeInTheDocument();
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    const [entry, item] = onSelectItem.mock.calls[0];
    expect(entry.type).toBe('deck');
    expect(item).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it('presetType skips step 1 and renders step 2 directly', () => {
    renderPicker({ presetType: 'card' });

    // Step-1 type list should not be present
    expect(screen.queryByText('Scenario')).not.toBeInTheDocument();
    // Step 2 items present
    expect(screen.getByText('Spider-Man')).toBeInTheDocument();
    // Title now reflects the entry label
    expect(
      screen.getByRole('dialog', { name: /single card/i }),
    ).toBeInTheDocument();
  });

  it('selecting a static item invokes onSelectItem with entry + item', async () => {
    const { onSelectItem, user } = renderPicker();
    await user.click(screen.getByText('Scenario'));
    await user.click(screen.getByText('Klaw'));

    expect(onSelectItem).toHaveBeenCalledTimes(1);
    const [entry, item] = onSelectItem.mock.calls[0];
    expect(entry.type).toBe('scenario');
    expect(item).toMatchObject({
      id: 'klaw',
      label: 'Klaw',
      data: { file: 'scenarios/klaw.json' },
    });
  });

  it('Esc closes the modal', async () => {
    const { onClose, user } = renderPicker();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('back button at step 2 returns to step 1 in two-step mode', async () => {
    const { user } = renderPicker();
    await user.click(screen.getByText('Scenario'));
    expect(screen.getByText('Rhino')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to types' }));

    // Back to step 1 — type list visible
    expect(screen.getByText('Scenario')).toBeInTheDocument();
    expect(screen.getByText('Single Card')).toBeInTheDocument();
    expect(screen.queryByText('Rhino')).not.toBeInTheDocument();
  });

  it('shows "no loadables declared" when given an empty array', () => {
    renderPicker({ loadables: [] });
    expect(screen.getByText('No loadables declared')).toBeInTheDocument();
  });

  it('does not render anything when open=false', () => {
    const { container } = renderPicker({ open: false });
    expect(container.firstChild).toBeNull();
    // Portal target also empty
    expect(document.body.querySelector('.load-picker-backdrop')).toBeNull();
  });

  it('caps the asset-pack-derived list to 200 on first paint', () => {
    // Build a 250-item derived resolver — picker should render only 200
    // until the user types.
    const big = Array.from({ length: 250 }, (_, i) => ({
      id: `c${String(i)}`,
      label: `Card ${String(i)}`,
      data: { code: `c${String(i)}` },
    }));
    render(
      <LoadPickerModal
        open={true}
        onClose={vi.fn()}
        loadables={FIXTURE_LOADABLES}
        presetType="card"
        onSelectItem={vi.fn()}
        resolveDerivedItems={() => big}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const items = within(dialog).getAllByRole('listitem');
    expect(items.length).toBe(200);
  });

  it('static items are rendered with role=listitem inside step-2 list', async () => {
    const { user } = renderPicker();
    await user.click(screen.getByText('Scenario'));
    const list = screen.getAllByRole('list');
    // Step-2 list has 3 items
    const lastList = list[list.length - 1];
    expect(within(lastList).getAllByRole('listitem')).toHaveLength(3);
  });

  describe('card preview affordance (ct-87o)', () => {
    it('shows an eye-icon button on each card row', async () => {
      const { user } = renderPicker({ gameAssets: makeGameAssets() });
      await user.click(screen.getByText('Single Card'));

      // 8 fixture cards; each row gets a preview button.
      const buttons = screen.getAllByRole('button', { name: /^Preview / });
      expect(buttons.length).toBe(8);
      // Specific card row resolved by testid.
      expect(
        screen.getByTestId('load-picker-card-preview-spider-man'),
      ).toBeInTheDocument();
    });

    it('shows eye icons when the card entry has been materialized into static (registry path)', () => {
      // Production path: `loadablesRegistry.resolveEntry` materializes
      // asset-pack-derived sources into static, preserving `derivedFrom`.
      // The picker must detect either form. Build a one-entry fixture that
      // looks like the post-registry shape.
      const materialized = [
        {
          type: 'card',
          label: 'Single Card',
          mode: 'additive' as const,
          source: {
            kind: 'static' as const,
            derivedFrom: 'all-cards' as const,
            items: [
              {
                id: 'spider-man',
                label: 'Spider-Man',
                data: { code: 'spider-man' },
              },
              { id: 'hulk', label: 'Hulk', data: { code: 'hulk' } },
            ],
          },
        },
      ];
      render(
        <LoadPickerModal
          open={true}
          onClose={vi.fn()}
          loadables={materialized}
          presetType="card"
          onSelectItem={vi.fn()}
          gameAssets={makeGameAssets()}
        />,
      );

      // 2 cards in the materialized fixture.
      expect(screen.getAllByRole('button', { name: /^Preview / }).length).toBe(
        2,
      );
    });

    it('does NOT show eye-icon buttons for non-card loadables', async () => {
      const { user } = renderPicker({ gameAssets: makeGameAssets() });
      // Scenario is a static loadable, not asset-pack-derived/all-cards.
      await user.click(screen.getByText('Scenario'));

      expect(
        screen.queryByRole('button', { name: /^Preview / }),
      ).not.toBeInTheDocument();
    });

    it('does NOT show eye-icon buttons when gameAssets is omitted', async () => {
      // Even on the card entry, the host can omit gameAssets — picker
      // gracefully hides the affordance instead of crashing.
      const { user } = renderPicker({ gameAssets: null });
      await user.click(screen.getByText('Single Card'));

      expect(
        screen.queryByRole('button', { name: /^Preview / }),
      ).not.toBeInTheDocument();
    });

    it('clicking the eye icon does NOT trigger row select', async () => {
      const { user, onSelectItem } = renderPicker({
        gameAssets: makeGameAssets(),
      });
      await user.click(screen.getByText('Single Card'));

      await user.click(
        screen.getByTestId('load-picker-card-preview-spider-man'),
      );

      // No selection fired — the eye icon stops propagation.
      expect(onSelectItem).not.toHaveBeenCalled();
    });

    it('hover on eye icon shows the popover preview (desktop)', async () => {
      installMatchMedia(true); // hover-capable
      const { user } = renderPicker({ gameAssets: makeGameAssets() });
      await user.click(screen.getByText('Single Card'));

      // Initially no preview rendered.
      expect(screen.queryByTestId('card-preview-hover')).toBeNull();

      await user.hover(
        screen.getByTestId('load-picker-card-preview-spider-man'),
      );

      // CardPreview's hover-mode root carries data-testid="card-preview-hover".
      expect(screen.getByTestId('card-preview-hover')).toBeInTheDocument();

      // Unhover dismisses it.
      await user.unhover(
        screen.getByTestId('load-picker-card-preview-spider-man'),
      );
      expect(screen.queryByTestId('card-preview-hover')).toBeNull();
    });

    it('tap on eye icon opens the full-screen modal (touch)', async () => {
      installMatchMedia(false); // touch-only
      const { user } = renderPicker({ gameAssets: makeGameAssets() });
      await user.click(screen.getByText('Single Card'));

      // No popover on touch — modal only.
      expect(screen.queryByTestId('card-preview-hover')).toBeNull();

      await user.click(
        screen.getByTestId('load-picker-card-preview-spider-man'),
      );

      // FullScreenCardPreview carries data-testid="card-preview-modal".
      expect(screen.getByTestId('card-preview-modal')).toBeInTheDocument();
    });
  });
});
