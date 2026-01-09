// messages.js (B3.16)
// "Lidské" hlášky meteostanice – klidné, přívětivé, nekřičí.
// Vrací { title, body } + jemné emoji (volitelné) a důvodový detail.

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function pick(arr, seed = 0) {
  if (!arr || !arr.length) return "";
  // deterministický výběr (aby to "neblikalo" každou vteřinu)
  const i = Math.abs(Math.floor(seed)) % arr.length;
  return arr[i];
}

function round1(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(Number(n) * 10) / 10;
}

function fmtH(n) {
  const x = round1(n);
  if (x === null) return "—";
  return `${x} h`;
}

function fmtWh(n) {
  const x = round1(n);
  if (x === null) return "—";
  return `${x} Wh`;
}

function niceTimeOfDay(isDay) {
  return isDay ? "přes den" : "v noci";
}

/**
 * ctx:
 *  - isDay (bool)
 *  - energyState: "POSITIVE"|"BALANCED"|"DRAINING_SAFE"|"DRAINING_RISK"|"CRITICAL"
 *  - samplingMode: "HIGH"|"NORMAL"|"LOW"|"ULTRA_LOW"|"HIBERNATE"
 *  - savingMode (bool)
 *  - netW (number)
 *  - hoursLeftBattery (number|null)
 *  - sunriseWillSurvive (bool|null)
 *  - sunriseDeficitWh (number|null)
 *  - expectedSolarWh (number|null)
 *  - cycleSeed (number)  // např. hour + cycleDay*100 (deterministicky)
 */
export function composeStationMessage(ctx) {
  const {
    isDay,
    energyState,
    samplingMode,
    savingMode,
    netW,
    hoursLeftBattery,
    sunriseWillSurvive,
    sunriseDeficitWh,
    expectedSolarWh,
    cycleSeed = 0
  } = ctx || {};

  const net = Number(netW || 0);
  const netSign = net >= 0 ? "+" : "";
  const netTxt = `${netSign}${round1(net)} W`;

  // „měkká“ eskalace: title krátký, body lidský
  // 1) Priorita: přežití do svítání v noci
  if (sunriseWillSurvive === false) {
    const title = pick(
      ["Jedu úsporně", "Teď šetřím energii", "Zpomalím, ať vydržím"],
      cycleSeed
    );
    const bodyVariants = [
      `Vypadá to, že by energie do rána mohla chybět. Omezím sběr a pojedu úsporně.`,
      `Abych v klidu dojel do svítání, přepínám do úspornějšího režimu.`,
      `Radši teď šetřím. Chci v pohodě vydržet do rána.`
    ];
    const body = pick(bodyVariants, cycleSeed + 7)
      + (sunriseDeficitWh != null ? ` (chybí zhruba ${fmtWh(sunriseDeficitWh)})` : "");
    return { title, body, tone: "gentle_warn" };
  }

  // 2) CRITICAL
  if (energyState === "CRITICAL") {
    const title = pick(
      ["Úsporný režim", "Teď šetřím", "Zklidňuju provoz"],
      cycleSeed
    );
    const bodyVariants = [
      `Baterie je nízko, proto omezím vše, co není nutné. ${niceTimeOfDay(isDay)} je to nejbezpečnější.`,
      `Teď jedu na minimum. Jakmile se podmínky zlepší, zase přidám.`,
      `Šetřím energii, aby stanice zůstala spolehlivá.`
    ];
    const body = pick(bodyVariants, cycleSeed + 11);
    return { title, body, tone: "gentle_critical" };
  }

  // 3) DRAINING_RISK
  if (energyState === "DRAINING_RISK") {
    const title = pick(
      ["Opatrně s energií", "Trochu šetřím", "Lehce přibrzdím"],
      cycleSeed
    );
    const bodyVariants = [
      `Energie ubývá rychleji, než bych chtěl. Omezím sběr, ať to drží stabilně.`,
      `Teď to vypadá na úbytek energie, tak přepnu na úspornější sběr.`,
      `Radši budu šetrnější, ať mám rezervu.`
    ];
    const body = pick(bodyVariants, cycleSeed + 13)
      + (hoursLeftBattery != null ? ` (odhad výdrže ~${fmtH(hoursLeftBattery)})` : "");
    return { title, body, tone: "gentle_warn" };
  }

  // 4) BALANCED
  if (energyState === "BALANCED") {
    const title = pick(
      ["Stabilní podmínky", "Všechno v klidu", "Jedu vyrovnaně"],
      cycleSeed
    );
    const bodyVariants = [
      `Podmínky jsou vyrovnané. Sbírám data rozumným tempem. (net ${netTxt})`,
      `Jsem v pohodě. Držím vyvážený režim a loguju data.`,
      `Teď je to stabilní, tak jedu standardně.`
    ];
    return { title, body: pick(bodyVariants, cycleSeed + 17), tone: "calm" };
  }

  // 5) POSITIVE
  if (energyState === "POSITIVE") {
    const title = pick(
      ["Dobíjím a sbírám", "Hezké podmínky", "Energie přibývá"],
      cycleSeed
    );
    const bodyVariants = [
      `Mám energetický zisk, takže si můžu dovolit sbírat data častěji. (net ${netTxt})`,
      `Teď je to fajn – energie přibývá. Udržuju aktivnější sběr.`,
      `Dobíjím, takže jedu svižněji.`
    ];
    const extra = (expectedSolarWh != null && isDay)
      ? ` (odhad do západu ~${fmtWh(expectedSolarWh)})`
      : "";
    return { title, body: pick(bodyVariants, cycleSeed + 19) + extra, tone: "positive" };
  }

  // 6) DRAINING_SAFE (default)
  const title = pick(
    ["Jedu úsporněji", "Klidný režim", "Šetrný provoz"],
    cycleSeed
  );
  const bodyVariants = [
    `Energie pomalu ubývá, ale zatím je to bezpečné. Sbírám data střídmě. (net ${netTxt})`,
    `Teď jedu klidněji, aby baterie vydržela. Když se zlepší podmínky, přidám.`,
    `Zatím vše v pohodě. Jen držím šetrnější režim.`
  ];
  const body = pick(bodyVariants, cycleSeed + 23)
    + (savingMode ? ` (úsporný režim je zapnutý)` : "");
  return { title, body, tone: "calm" };
}
