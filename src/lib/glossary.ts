/** Plain-language meanings shown on hover / keyboard focus. Short, no jargon inside the explanations. */
export const GLOSSARY = {
  nav: "The price of one unit of the fund. It is set once a day, after the market closes.",
  similar: "Other funds of the same kind from other companies. We compare your fund with their average.",
  index: "A published score for a whole part of the market (for example the 50 biggest companies). It shows how the market itself did.",
  points: "The gap between two percentages. If your fund rose 2.0% and the market rose 1.7%, your fund is 0.3 points ahead.",
  ytd: "How much the fund has gone up or down since the first trading day of this year.",
  outperforming: "Doing better than the average of similar funds over the last month, by at least half a point.",
  split: "How much of this week's move came from the whole market going up or down, and how much was down to this particular fund.",
  sip: "A Systematic Investment Plan: a fixed amount that goes into a fund every month automatically.",
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;
