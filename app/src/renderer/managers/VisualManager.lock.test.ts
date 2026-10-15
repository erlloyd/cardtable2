import { describe, it, expect, beforeEach } from 'vitest';
import { Application } from 'pixi.js';
import type { Container } from 'pixi.js';
import { ObjectKind } from '@cardtable2/shared';
import type { TableObject } from '@cardtable2/shared';
import { getBehaviors } from '../objects';
import {
  ZONE_LABEL_GAP,
  ZONE_LABEL_HIT_HEIGHT,
} from '../objects/zone/constants';
import { VisualManager } from './VisualManager';
import type { SceneManager } from '../SceneManager';
import { RenderMode } from '../IRendererAdapter';

function makeObject(kind: ObjectKind, locked: boolean): TableObject {
  return {
    _kind: kind,
    _containerId: null,
    _pos: { x: 100, y: 50, r: 0 },
    _sortKey: '1',
    _locked: locked,
    _selectedBy: null,
    _meta: {},
    ...(kind === ObjectKind.Stack
      ? { _cards: ['c1'], _faceUp: true }
      : kind === ObjectKind.Token
        ? { _faceUp: true }
        : {}),
  };
}

function hasBadge(visual: Container): boolean {
  return visual.children.some((c) => c.label === 'lock-badge');
}

describe('VisualManager - lock badge', () => {
  let visualManager: VisualManager;
  let objects: Map<string, TableObject>;
  let sceneManager: SceneManager;

  beforeEach(() => {
    visualManager = new VisualManager();
    visualManager.initialize(new Application(), RenderMode.Worker);
    objects = new Map();
    sceneManager = {
      getObject: (id: string) => objects.get(id),
      getAllObjects: () => objects,
    } as unknown as SceneManager;
  });

  function setup(id: string, kind: ObjectKind, locked: boolean): Container {
    const obj = makeObject(kind, locked);
    objects.set(id, obj);
    const visual = visualManager.createObjectVisual(id, obj);
    visualManager.addVisual(id, visual);
    return visual;
  }

  it('shows the badge on a locked stack but not an unlocked one', () => {
    const locked = setup('s1', ObjectKind.Stack, true);
    const unlocked = setup('s2', ObjectKind.Stack, false);
    expect(hasBadge(locked)).toBe(true);
    expect(hasBadge(unlocked)).toBe(false);
  });

  it('adds and removes the badge as _locked changes on an existing object', () => {
    const visual = setup('s1', ObjectKind.Stack, false);
    expect(hasBadge(visual)).toBe(false);

    objects.get('s1')!._locked = true;
    visualManager.updateVisualForObjectChange('s1', sceneManager);
    expect(hasBadge(visual)).toBe(true);

    objects.get('s1')!._locked = false;
    visualManager.updateVisualForObjectChange('s1', sceneManager);
    expect(hasBadge(visual)).toBe(false);
  });

  it('shows the badge on a locked zone and a locked token', () => {
    const zone = setup('z1', ObjectKind.Zone, true);
    const token = setup('t1', ObjectKind.Token, true);
    expect(hasBadge(zone)).toBe(true);
    expect(hasBadge(token)).toBe(true);

    objects.get('z1')!._locked = false;
    visualManager.updateVisualForObjectChange('z1', sceneManager);
    expect(hasBadge(zone)).toBe(false);
  });

  it('places a zone badge at the box corner, below the label band', () => {
    const zone = setup('z1', ObjectKind.Zone, true);
    const badge = zone.children.find((c) => c.label === 'lock-badge')!;
    const b = badge.getLocalBounds();
    const zoneObj = objects.get('z1')!;
    const bounds = getBehaviors(ObjectKind.Zone).getBounds(zoneObj);
    const boxTop =
      bounds.minY + ZONE_LABEL_GAP + ZONE_LABEL_HIT_HEIGHT - zoneObj._pos.y;
    expect(b.minY).toBeGreaterThanOrEqual(boxTop);
    expect(b.maxX).toBeLessThanOrEqual(bounds.maxX - zoneObj._pos.x);
  });
});
