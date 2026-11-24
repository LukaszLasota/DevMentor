export interface MentorPrices {
  /** Preformatted by the page with formatMoney (spec #24), e.g. "$40.00". */
  price25: string;
  price50: string;
}

/**
 * Session length and price as a plain price list (R03.3), prices in mono with tabular figures (R03.1).
 * #98: no chip background or rounded box — chips read as the length options next to each time, which
 * are the only place a length is picked.
 */
export function SessionFacts({ prices }: { prices: MentorPrices }) {
  const facts = [
    { length: "25 min", price: prices.price25 },
    { length: "50 min", price: prices.price50 },
  ];

  return (
    <ul aria-label="Session prices" className="flex flex-wrap gap-x-paragraph gap-y-related text-caption">
      {facts.map((fact) => (
        <li key={fact.length} className="inline-flex items-baseline gap-related">
          <span className="text-muted-foreground">{fact.length}</span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="font-mono font-medium tabular-nums text-foreground">{fact.price}</span>
        </li>
      ))}
    </ul>
  );
}
