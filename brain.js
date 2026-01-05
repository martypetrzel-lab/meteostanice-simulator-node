export function decide(state) {
  const { device, power } = state;

  if (power.soc < 0.2)
    return "Nízký SOC – šetřím energii";

  if (device.temperature > 30 && power.soc > 0.4)
    return "Vysoká teplota – připraven chladit";

  if (power.production > power.load)
    return "Dostatek energie – nabíjím";

  if (power.production === 0)
    return "Noc – běžím úsporně";

  return "Podmínky stabilní";
}
