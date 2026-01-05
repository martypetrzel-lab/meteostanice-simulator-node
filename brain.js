export class Brain {
  decide(state) {
    const reasons = [];
    const alternatives = [];

    const temp = state.device.temperature;
    const soc = state.device.battery.soc;
    const light = state.world.environment.light;

    let fan = false;

    // --- TEPLO ---
    if (temp !== null && temp > 30) {
      if (soc > 0.4) {
        fan = true;
        reasons.push("Teplota vysoká a baterie dovoluje chlazení");
      } else {
        alternatives.push("Chlazení odloženo – nízká baterie");
      }
    }

    // --- PREDIKCE SVĚTLA ---
    if (light < 200) {
      reasons.push("Nízké světlo – šetřím energii");
      alternatives.push("Při vyšším světle by běžel větrák");
    }

    return {
      fan,
      explanation: {
        reasons,
        alternatives,
        summary: fan
          ? "Rozhodnutí: chladím"
          : "Rozhodnutí: šetřím energii"
      }
    };
  }
}
