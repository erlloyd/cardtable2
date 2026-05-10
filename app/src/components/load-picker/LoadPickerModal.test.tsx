import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import {
  LoadPickerModal,
  type LoadPickerSelectHandler,
} from './LoadPickerModal';
import {
  FIXTURE_LOADABLES,
  fixtureResolveDerivedItems,
} from './LoadPickerModal.fixture';

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
});
