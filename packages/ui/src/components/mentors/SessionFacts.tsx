export interface MentorPrices {
  /** Preformatted by the page with formatMoney (spec #24), e.g. "$40.00". */
  price25: string;
  price50: string;
}

/** Session length and price as separate fact chips (R03.3), prices in mono with tabular figures (R03.1). */
export function SessionFacts({ prices }: { prices: MentorPrices }) {
  const facts = [
    { length: "25 min", price: prices.price25 },
    { length: "50 min", price: prices.price50 },
  ];

  return (
    <ul aria-label="Session prices" className="flex flex-wrap gap-related">
      {facts.map((fact) => (
        <li
          key={fact.length}
          className="inline-flex items-center gap-related rounded-control bg-muted px-related py-badge-y text-caption"
        >
          <span className="text-muted-foreground">{fact.length}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">{fact.price}</span>
        </li>
      ))}
    </ul>
  );
}
