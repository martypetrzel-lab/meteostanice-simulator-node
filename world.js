export function worldTick(state) {
  const hour = new Date(state.time.now).getHours();

  // světlo
  if (hour >= 7 && hour <= 18) {
    state.world.light = 200 + Math.random() * 400;
  } else {
    state.world.light = 5 + Math.random() * 10;
  }

  // teplota prostředí
  const drift = (Math.random() - 0.5) * 0.1;
  state.world.temperature += drift;
}
