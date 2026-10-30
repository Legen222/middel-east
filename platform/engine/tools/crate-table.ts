/**
 * Writes docs/platform/12-kisten-und-chancen.md: every crate with price, RTP, expected value and the exact
 * chance of every item, straight from SAMPLE_CASES so the document can never drift from the game.
 *   npm run crate-table
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SAMPLE_CASES, caseEv, caseRtp, caseWeight, priceCase } from '../src/index';

const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (p: number) => `${de(p * 100, p < 0.01 ? 3 : 2)} %`;
const tier = (value: number, price: number) => (value >= price * 20 ? 'Legendär' : value >= price * 5 ? 'Episch' : value >= price * 2 ? 'Selten' : value >= price ? 'Ungewöhnlich' : 'Gewöhnlich');

const crates = [...SAMPLE_CASES].sort((a, b) => priceCase(a) - priceCase(b));
let md = `# 12 · Kisten, Items und Chancen

Erzeugt aus den Spieldaten (\`platform/engine/src/games/cases.ts\`) mit \`npm run crate-table\` im Ordner \`platform/engine\`. Die Seite **Crate odds** (\`#/crates\`) zeigt dieselben Zahlen in der App.

**So entstehen die Zahlen:**
- **Chance:** Gewicht des Items ÷ Summe aller Gewichte der Kiste. Sie ist exakt und bei jeder Öffnung gleich.
- **Preis:** Erwartungswert ÷ 0,93, auf ganze Scrap aufgerundet. Damit zahlt jede Kiste höchstens 93 % zurück; der Hausvorteil ist mindestens 7 %.
- **Umrechnung:** 100 Scrap = 1 $.

**Seltenheit (relativ zum Kistenpreis):**

| Seltenheit | Wert |
|---|---|
| Legendär | ab 20 × Preis |
| Episch | ab 5 × |
| Selten | ab 2 × |
| Ungewöhnlich | ab 1 × |
| Gewöhnlich | unter dem Preis |

Dieselben Kisten gelten für Kisten-Öffnen und Case Battle.

## Übersicht

| # | Kiste | Preis (Scrap) | ≈ $ | RTP | Erwartungswert | Items | Bestes Item | Seine Chance |
|---|---|---:|---:|---:|---:|---:|---|---:|
`;
crates.forEach((c, i) => {
  const price = priceCase(c);
  const W = caseWeight(c);
  const top = [...c.items].sort((a, b) => b.value - a.value)[0];
  md += `| ${i + 1} | ${c.name} | ${de(price)} | ${de(price / 100, price % 100 ? 2 : 0)} | ${pct(caseRtp(c))} | ${de(caseEv(c), 2)} | ${c.items.length} | ${top.name} (${de(top.value)}) | ${pct(top.weight / W)} |\n`;
});
md += `\n## Alle Kisten im Detail\n`;
for (const c of crates) {
  const price = priceCase(c);
  const W = caseWeight(c);
  md += `\n### ${c.name} · ${de(price)} Scrap (≈ ${de(price / 100, price % 100 ? 2 : 0)} $)\n\nRTP ${pct(caseRtp(c))} · Erwartungswert ${de(caseEv(c), 2)} Scrap · ${c.items.length} Items · Gewichtssumme ${de(W)}\n\n`;
  md += `| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |\n|---|---|---:|---:|---:|---:|\n`;
  for (const it of [...c.items].sort((a, b) => b.value - a.value)) {
    const p = it.weight / W;
    md += `| ${it.name} | ${tier(it.value, price)} | ${de(it.value)} | ${de(it.value / price, 2)} × | ${pct(p)} | ${de(1 / p, p > 0.1 ? 1 : 0)} |\n`;
  }
}
const out = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/platform/12-kisten-und-chancen.md');
writeFileSync(out, md);
console.log(`${out}: ${crates.length} crates, ${crates.reduce((s, c) => s + c.items.length, 0)} items`);
