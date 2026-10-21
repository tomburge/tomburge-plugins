# Domain modelling (tactical DDD)

Use this when the domain has real business complexity: rules that interact, states with invariants, and processes spanning several steps. For simple data entry (CRUD) it's overkill; use the functional design alone.

| Tier | Use |
|---|---|
| low | Only if the domain is genuinely complex |
| moderate | For the core domain (the part that differentiates the product) |
| high | For the core domain, plus event storming to discover it |

## Discover the domain: event storming
Run it as a structured analysis of the requirements; you can't hold a workshop, so derive it from the documents and mark gaps as `ASSUMPTION:` or questions.
1. **Domain events:** list everything that happens in the business, in the past tense (`OrderPlaced`, `PaymentDeclined`, `ShipmentDispatched`), in time order.
2. **Commands:** what triggers each event (`PlaceOrder`), and who or what issues it (user type, scheduler, external system).
3. **Policies:** reactions of the form "whenever X happens, do Y" (`whenever PaymentDeclined, notify the customer`).
4. **Aggregates:** the thing that accepts a command, checks the rules and emits the events.
5. **Read models:** what each user needs to see to decide on the next command.
6. **Boundaries:** where the vocabulary changes, there's a bounded context boundary.
7. **Hotspots:** conflicts, unknowns and open questions. These go under Questions for the user.

## Building blocks
- **Entity:** has an identity that persists while its attributes change (a customer, an order).
- **Value object:** defined only by its attributes, and immutable (`Money`, `Temperature`, `EmailAddress`, `DateRange`). It validates itself on creation, so an invalid value can't exist. Prefer value objects to primitives for domain concepts.
- **Aggregate:** a cluster of entities and value objects treated as one unit for changes, with one **aggregate root** that's the only entry point.
  - The aggregate protects its **invariants**: the rules that must always hold inside it (an order's total equals its lines; you can't ship a cancelled order).
  - **One transaction changes one aggregate.** Changes to other aggregates happen through domain events, with eventual consistency.
  - **Reference other aggregates by ID**, never by holding the object.
  - **Keep aggregates small:** include only what's needed to enforce the invariants. Large aggregates cause contention and slow loads.
- **Domain event:** a fact that happened, named in the past tense, immutable, and carrying the data consumers need. Publish it with the state change (transactional outbox), so neither is lost.
- **Repository:** one per aggregate, which loads and saves the whole aggregate. There are no repositories for entities inside an aggregate.
- **Domain service:** domain logic that doesn't belong to one entity (e.g. a transfer between two accounts). It's stateless.
- **Application service:** orchestrates a use case: loads aggregates, calls domain logic, saves, publishes events, and handles transactions and authorization. It contains no business rules.

## Context map
How bounded contexts relate. Record each relationship in the design.

| Pattern | Meaning |
|---|---|
| Partnership | Two contexts evolve together, with joint planning |
| Shared kernel | A small shared model both depend on. It couples releases, so keep it tiny |
| Customer / supplier | The downstream context's needs shape the upstream's interface |
| Conformist | The downstream adopts the upstream's model as is (often with external providers) |
| Anti-corruption layer | The downstream translates the upstream's model into its own, so it doesn't leak in. Use it for legacy and third-party systems |
| Open host service | The upstream offers a well-defined protocol for many consumers |
| Published language | A documented, versioned exchange format (an API or event schema) |
| Separate ways | No integration; each context solves the need on its own |

## Output
In `03-design.md`, add a **Domain Model** section:
- the bounded contexts and the context map (Mermaid)
- for the core domain: aggregates with their roots, invariants and the commands they accept; value objects; and domain events with their consumers

Link the invariants and commands to the `BR-n` and `FR-n` IDs they implement.

Facts checked against primary sources on 2026-10-14.
