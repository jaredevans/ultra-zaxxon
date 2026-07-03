import { describe, it, expect } from 'vitest';
import { createShip, killShip, updateShip, EXPLODE_TIME } from '../src/entities/ship';

describe('attack angle (pitch) state', () => {
  const DT = 1 / 60;

  it('starts level', () => {
    const ship = createShip();
    expect(ship.pitch).toBe(0);
    expect(ship.bank).toBe(0);
  });

  it('forced descent pitches the nose down toward -1', () => {
    const ship = createShip();
    ship.fuel = 0;
    for (let i = 0; i < 60; i++) updateShip(ship, DT, 0);
    expect(ship.pitch).toBeLessThan(-0.8);
  });

  it('pitch eases back to level when the cause ends', () => {
    const ship = createShip();
    ship.pitch = 1;
    for (let i = 0; i < 60; i++) updateShip(ship, DT, 0);
    expect(Math.abs(ship.pitch)).toBeLessThan(0.05);
  });
});

describe('death and respawn positioning', () => {
  it('the explosion plays at the impact position, not the respawn point', () => {
    const ship = createShip();
    ship.x = 20;
    ship.z = 15;
    killShip(ship);
    expect(ship.state.kind).toBe('exploding');
    // ship stays where it was hit for the duration of the explosion
    expect(ship.x).toBe(20);
    expect(ship.z).toBe(15);
  });

  it('the ship recenters only when the explosion ends and respawn begins', () => {
    const ship = createShip();
    ship.x = 20;
    ship.z = 15;
    killShip(ship);
    const dt = 1 / 60;
    for (let t = 0; t < EXPLODE_TIME + dt; t += dt) updateShip(ship, dt, 0);
    expect(ship.state.kind).toBe('respawning');
    expect(ship.x).toBe(50);
    expect(ship.z).toBe(50);
  });
});
