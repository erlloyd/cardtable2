# Scenario Loading System

## Overview

Implement a system for loading complete scenarios (or equivalent game-specific concepts) into the table, starting with Marvel Champions as the reference implementation.

## Terminology

**Scenario**: A complete, playable game setup. Depending on the game, this might be called a scenario, mission, quest, encounter, etc. We use "scenario" as the general term.

## Core Principles

### Loading Behavior
- **Append mode**: Scenarios add to the existing table (don't clear)
- **In-table UI**: Users select scenarios from within the table interface
- **No validation**: Initially, no dependency checking for required packs

### Well-Defined vs Variable Content

**Well-Defined (Scenario Load)**:
- Items that are ALWAYS present for this scenario
- Example: Rhino villain deck, main scheme, threat tokens, acceleration tokens
- Loaded automatically when user selects the scenario

**Variable (Post-Load)**:
- Items requiring player choices after scenario loads
- Example: Player hero decks, optional modular encounter sets, individual cards
- User loads these manually (Phase 1) or via wizard (Phase 2)

## Implementation Phases

### Phase 1: Ad-Hoc Loading (Current Focus)
1. Load scenario → well-defined items appear on table
2. User manually loads additional items:
   - Hero decks
   - Optional modular encounter sets
   - Individual cards (obligations, nemesis)

### Phase 2: Wizard Workflow (Future)
1. Game-level default questions (defined per game)
2. Scenario-level customization (override/augment game defaults)
3. Guided post-scenario loading flow
4. User can still bypass wizard and load manually

**Note**: Document wizard system in separate plan when ready to implement.

## Data Format Strategy

### Plugin Format with Transformation Scripts

**Decision**: Create a CardTable2-specific plugin format, with transformation scripts to convert external data sources (like Marvel Champions schema).

**Rationale**:
1. **Independence**: CardTable2 data is self-contained, not dependent on external repos
2. **Consistency**: Unified format across all games (Marvel Champions, Arkham Horror, custom games)
3. **Flexibility**: Each game can have different source schemas, all transform to same plugin format
4. **Control**: Define exactly what CardTable2 needs without forcing it into external schemas
5. **Future-proof**: External schema updates trigger re-running transform, not data migration

### What External Schemas Provide (Marvel Champions Example)

**Card Grouping** (`/Users/erlloyd/Code/cardtable/src/external/marvelsdb-json-data`):
- `set_code`: Groups cards into sets (e.g., `"rhino"`, `"standard"`, `"bomb_scare"`)
- `type_code`: Card types (villain, main_scheme, minion, treachery, ally, event, upgrade, etc.)
- `card_set_type_code`: Set types (villain, modular, standard, expert, hero, nemesis)
- `set_position`: Card order within sets
- `pack_code`: Release pack grouping
- `quantity`: Number of copies per pack

**Card Properties**:
- Basic info: name, text, flavor, traits, cost
- Stats: attack, defense, thwart, health, recover
- Resources: energy, mental, physical, wild
- Threat/scheme values for encounter cards
- Double-sided card support (back_link, hidden)
- Stage progression (I/II/III for villains, 1A/1B for schemes)

**Scenario Construction**:
- Can programmatically build scenarios by filtering on `set_code`
- Group by `type_code` to separate card types
- Use `set_position` for ordering within stacks

### What's Missing (Must Add in Plugin Format)

1. **Positioning**: x/y coordinates for where stacks/objects appear on table
2. **Non-card objects**:
   - Tokens (threat, acceleration, damage, etc.)
   - Zones (encounter deck, discard, player areas)
   - Playmats (villain area, player play area)
   - Counters (round tracker, first player token)
3. **Scenario metadata**:
   - Which sets compose a scenario (e.g., "Rhino" = rhino set + standard set + 1 modular slot)
   - Optional vs required components
   - Recommended modular sets
4. **CardTable2-specific metadata**:
   - ObjectKind mappings (stack, token, zone, mat, counter)
   - Sprite/texture paths
   - Interaction behaviors

## Transformation Approach

### Key Principle: Duplicate Card Data

Transform external schemas into self-contained CardTable2 plugin format:
- **Duplicate** card data (don't reference external sources)
- **Add** positioning and layout information
- **Add** non-card objects (tokens, zones, mats)
- **Add** scenario composition metadata
- **Add** CardTable2-specific properties

### Transform Script Location
TBD - options:
- Part of CardTable2 repo (monorepo package?)
- Separate tool/repo
- Build-time vs runtime transformation

## Marvel Champions as Reference Implementation

### First Scenario Target
**Rhino (Core Set)** - simplest complete scenario

### Scenario Structure
- Main Scheme cards (1A/1B stages)
- Villain cards (stage I/II/III progression)
- Encounter sets:
  - Rhino set (villain-specific)
  - Standard set (basic encounter cards)
  - One modular set slot (e.g., Bomb Scare)
- Tokens: threat, acceleration, damage, generic counters
- Zones: encounter deck, encounter discard, villain area

### Variable Elements (Manual Load in Phase 1)
- Hero decks (identity + alter-ego + signature cards)
- Aspect cards (aggression, justice, leadership, protection)
- Optional modular encounter sets
- Player-specific cards (obligations, nemesis sets)

## Next Steps

1. **Define Plugin Format**: Specify exact schema for CardTable2 plugins
2. **Create Transform Script**: Marvel Champions → Plugin format converter
3. **Implement Scenario Loader**: UI + backend logic to load scenarios
4. **Rhino Scenario**: First complete scenario implementation
5. **Manual Loaders**: UI for loading hero decks, modular sets (Phase 1)

## Open Questions

1. Plugin format schema details (to be defined next)
2. Where scenarios appear in UI (menu, command, button?)
3. How to handle deck shuffling on load
4. Face-up vs face-down defaults for different card types
5. Transform script integration into build/deployment process

## References

- Marvel Champions schema: `/Users/erlloyd/Code/cardtable/src/external/marvelsdb-json-data`
- Existing content system: `app/src/content/loader.ts`, `app/src/content/instantiate.ts`
- Asset pack format: `app/public/packs/testgame-core.json` (schema: ct-assets@1)
