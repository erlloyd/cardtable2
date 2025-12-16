# Cardtable Games System

## Overview

Cardtable 2.0 is designed as a platform that can load different games as **Cardtable Games**. Each game is a self-contained package that includes:

1. **Content** (card data, images, tokens, zones)
2. **Rules** (optional automation and enforcement)
3. **Custom Actions** (game-specific player actions)
4. **UI Extensions** (game-specific interface elements)

Think of Cardtable Games like browser extensions - they plug into the platform and extend it with game-specific functionality.

---

## Vision: From Content to Complete Games

### Phase 1: Content-Only Games (Current + Near-term)

**What it includes**:
- JSON files describing cards, tokens, and zones
- Metadata about card sets and how they spawn
- Links to hosted images
- No automation - purely informational

**Example**: Marvel Champions game includes:
- Card definitions (heroes, villains, encounter sets)
- Token types (damage, threat, stun)
- Standard zones (play area, discard, encounter deck)
- Image URLs for all cards

### Phase 2: Games with Actions (Medium-term)

**What it adds**:
- Custom action buttons in the UI
- Game-specific operations (deal hand, shuffle deck, score)
- Helper utilities (calculate total damage, draw X cards)

**Example**: Poker game adds:
- "Deal Texas Hold'em" action
- "Evaluate Hand" action
- "Collect Pot" action

### Phase 3: Games with Rules (Long-term)

**What it adds**:
- Rules engine that can automate mechanics
- Optional rule enforcement (prevent invalid moves)
- Game state tracking (phases, turn order)
- Win condition detection

**Example**: Magic: The Gathering game adds:
- Automatic tap/untap during phases
- Mana calculation
- Combat damage resolution
- "You can't cast sorceries during combat" enforcement

---

## Architecture: How Games Plug Into Cardtable

### CardtableGame Interface

Every game implements a standard interface:

```typescript
interface CardtableGame {
  // Identity
  id: string;           // e.g., "marvel-champions"
  name: string;         // e.g., "Marvel Champions"
  version: string;      // e.g., "1.0.0"

  // Content (Phase 1)
  loadContent(): Promise<GameContent>;

  // Actions (Phase 2)
  registerActions?(actionRegistry: ActionRegistry): void;

  // Rules (Phase 3)
  registerRules?(rulesEngine: RulesEngine): void;
  validateMove?(move: ObjectMove): ValidationResult;
}
```

### Game Directory Structure

```
/src/games/
  marvel-champions/
    game.ts              # Main game definition
    content/
      cards.json         # Card data
      heroes.json        # Hero-specific data
      metadata.json      # Tokens, zones, etc.
    actions/
      dealEncounter.ts   # Custom actions
    rules/               # Optional: Phase 3
      phases.ts
      validation.ts

  poker/
    game.ts
    content/
      deck.json
      metadata.json
    actions/
      dealHand.ts
      evaluateHand.ts
```

---

## How Players Use Cardtable Games

### 1. Game Selection

**Game Selection Screen**:
```
┌────────────────────────────────────────┐
│  Choose a Game                         │
│                                        │
│  [🦸 Marvel Champions]                │
│  [🃏 Poker]                            │
│  [🎴 Magic: The Gathering]            │
│  [🎲 Custom Game]                     │
│                                        │
│  [+ Load Game from File]              │
└────────────────────────────────────────┘
```

When player clicks "Marvel Champions":
1. Cardtable loads the game definition
2. Game's content is loaded (cards, images, tokens)
3. Game-specific actions appear in menus
4. Game rules (if any) are activated

### 2. Playing with the Game

**Board UI shows game-specific elements**:

```
┌────────────────────────────────────────────────────┐
│ Marvel Champions: Rise of Red Skull               │
│                                                    │
│ ┌────────────┐  ┌──────────────────────────────┐ │
│ │ Game       │  │  [Draw Card]  [Mulligan]     │ │
│ │ Actions    │  │  [Ready All]  [Next Phase]   │ │
│ │            │  │  [Deal Encounter]             │ │
│ └────────────┘  └──────────────────────────────┘ │
│                                                    │
│               [Main Table Canvas]                  │
│                                                    │
└────────────────────────────────────────────────────┘
```

The buttons shown depend on which game is loaded.

---

## Benefits of Cardtable Games System

### For Players

**Consistency**: Learn Cardtable once, play any game
**Quality**: Games work the same way across all devices
**Multiplayer**: Automatic online play for any game
**Solo-Friendly**: Built-in tools for solo gameplay (hand switching, automation)
**Customization**: Load custom games or variants

### For Game Designers

**No Coding Required** (Phase 1): Just provide JSON files
**Incremental Complexity**: Start simple, add rules later
**Testing Tools**: Cardtable provides debugging and testing
**Distribution**: Share games as files or links
**Updates**: Players automatically get game updates

### For Cardtable Development

**Separation of Concerns**: Core platform vs game-specific logic
**Testability**: Test platform and games independently
**Extensibility**: Add new games without modifying core
**Community**: Enable community-created games

---

## How Games Integrate with Hybrid Architecture

### Presentation Layer (React)
```
Board Component
  ├─ Main Table (canvas)
  ├─ Hand Panel
  └─ Game Actions Panel ← Shows game-specific actions
```

### Application Layer
```
GameRegistry
  ├─ Loads games
  ├─ Manages game lifecycle
  └─ Provides game context to other layers

ContentManager
  └─ Loads game content (cards, images, metadata)
```

### Message Bus Integration
```
Core Message Handlers
  ├─ pointer-down, objects-moved, etc.
  └─ Game can add middleware to intercept/validate

Game Message Handlers
  └─ deal-hand, evaluate-hand, next-phase, etc.
```

### Manager Layer
```
Core Managers (Camera, Selection, Drag, etc.)
  └─ Work the same for all games

Game-Specific Managers (optional)
  └─ PokerHandEvaluator, MTGPhaseManager, etc.
```

---

## Implementation Phases

### Phase 1: Content System (M4 - Set Loader & Assets)

**Already Planned!** This is milestone M4 in the roadmap.

**Deliverables**:
- ContentManager that loads JSON game definitions
- Game selection UI
- Asset loading (card images)
- Initial game: Marvel Champions

**No architecture changes needed** - fits into hybrid design naturally.

### Phase 2: Action System (M3.5 + extensions)

**Foundation Already Exists!** ActionRegistry from M3.5.1-T6.

**Deliverables**:
- Games can register custom actions
- Action availability based on game state
- Action UI integrated into Board
- Example: Poker actions (Deal, Evaluate, Fold)

**Minimal architecture additions** - ActionRegistry already designed for this.

### Phase 3: Rules Engine (Future - Post M10)

**Foundation Being Built!** Message bus + middleware enable this.

**Deliverables**:
- Rules validation middleware
- Game state tracking
- Automated actions
- Optional enforcement modes (strict vs casual)
- Example: MTG phase management, mana tracking

**Architecture supports this** - games plug in as middleware.

---

## Example: Marvel Champions Game

### Content (cards.json)
```json
{
  "sets": [
    {
      "id": "core-heroes",
      "name": "Core Set Heroes",
      "cards": [
        {
          "id": "spider-man",
          "name": "Spider-Man",
          "imageUrl": "https://cdn.marvelcdb.com/cards/01001.jpg",
          "type": "hero"
        }
      ]
    }
  ],
  "tokens": [
    { "type": "damage", "color": "red" },
    { "type": "threat", "color": "yellow" }
  ],
  "zones": [
    { "name": "Play Area", "width": 800, "height": 600 },
    { "name": "Victory Display", "width": 200, "height": 400 }
  ]
}
```

### Actions (Phase 2)
```typescript
// games/marvel-champions/actions/dealEncounter.ts

export function registerMarvelChampionsActions(registry: ActionRegistry) {
  registry.register({
    id: 'mc:deal-encounter',
    label: 'Deal Encounter Card',
    icon: '🃏',
    category: 'Marvel Champions',
    isAvailable: (context) => {
      return context.selection.selection.length === 0;
    },
    execute: async (context) => {
      // Draw from encounter deck, place in staging area
      const encounterDeck = findObjectByName(context.store, 'Encounter Deck');
      const card = drawTopCard(encounterDeck);
      moveToZone(context.store, card, 'Staging Area');
    }
  });

  registry.register({
    id: 'mc:ready-all',
    label: 'Ready All Cards',
    icon: '🔄',
    category: 'Marvel Champions',
    execute: async (context) => {
      // Rotate all cards to 0 degrees (untapped)
      const allCards = getTableObjects(context.store, { kind: 'stack' });
      for (const card of allCards) {
        card._pos.r = 0;
        context.store.setObject(card.id, card);
      }
    }
  });
}
```

### Rules (Phase 3 - Future)
```typescript
// games/marvel-champions/rules/phases.ts

export class MarvelChampionsRules implements GameRules {
  validateMove(move: ObjectMove): ValidationResult {
    // Example: Can't move villain cards during player phase
    if (this.gameState.phase === 'player-turn') {
      if (move.object.type === 'villain') {
        return {
          valid: false,
          reason: "Cannot move villain cards during player turn"
        };
      }
    }

    return { valid: true };
  }

  onPhaseChange(newPhase: string): void {
    // Automatic actions when phase changes
    if (newPhase === 'villain-phase') {
      this.dealEncounterCards();
    }
  }
}
```

---

## Technical Architecture Details

### Game Loading

```typescript
// GameRegistry loads games dynamically
class GameRegistry {
  async loadGame(gameId: string): Promise<CardtableGame> {
    // Dynamic import
    const gameModule = await import(`./games/${gameId}/game.ts`);
    const game = new gameModule.default();

    // Load content
    const content = await game.loadContent();
    this.contentManager.setGameContent(gameId, content);

    // Register actions (if Phase 2)
    if (game.registerActions) {
      game.registerActions(this.actionRegistry);
    }

    // Register rules (if Phase 3)
    if (game.registerRules) {
      game.registerRules(this.rulesEngine);
    }

    this.currentGame = game;
    return game;
  }
}
```

### Message Integration

```typescript
// Games can add middleware to message bus
class PokerGame implements CardtableGame {
  registerRules(rulesEngine: RulesEngine): void {
    // Intercept messages to enforce rules
    rulesEngine.addMiddleware(async (message, context, next) => {
      if (message.type === 'objects-moved') {
        // Validate poker-specific move rules
        if (!this.isValidPokerMove(message)) {
          return; // Block the move
        }
      }
      await next();
    });
  }
}
```

---

## Future Possibilities

### Community Games
- Players can create and share games
- Game marketplace or repository
- Rating and review system

### Game Templates
- Starter templates for common game types (deck-builders, euros, etc.)
- Wizard to create simple games without coding

### Advanced Features
- Scripting language for non-programmers (visual scripting?)
- AI opponents using game rules
- Tutorial mode that teaches game rules
- Replay system using game state history

---

## Summary

**Cardtable Games** transform Cardtable from a virtual table into a **gaming platform**. The hybrid architecture being built now provides the perfect foundation for this vision:

- **Phase 1 (Content)**: Fits naturally into ContentManager
- **Phase 2 (Actions)**: ActionRegistry already designed for this
- **Phase 3 (Rules)**: Message bus + middleware enable rule enforcement

Each phase is optional and builds on the previous, allowing games to start simple and grow more sophisticated over time.

The refactoring work you're doing now isn't just fixing the current codebase - it's **building the foundation** for Cardtable to become a comprehensive digital card game platform.
