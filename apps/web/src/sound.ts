import { useSyncExternalStore } from 'react';
import type { Sound } from './reveal';

// Every sound is synthesised here with the Web Audio API; there are no audio files.

const MUTED_KEY = 'take5:muted';
const listeners = new Set<() => void>();
let muted = readMuted();
let context: AudioContext | null = null;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    if (value) localStorage.setItem(MUTED_KEY, '1');
    else localStorage.removeItem(MUTED_KEY);
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

export function useMuted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => muted,
  );
}

/** Browsers only allow audio after a user gesture, so the context is made or resumed on one. */
export function unlockAudio(): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

export function playSound(sound: Sound): void {
  if (muted || !context || context.state !== 'running') return;
  const now = context.currentTime;
  switch (sound) {
    case 'flip':
      swish(context, now, 2400);
      swish(context, now + 0.07, 3200);
      break;
    case 'place':
      tock(context, now);
      break;
    case 'take':
      moo(context, now);
      break;
  }
}

function envelope(ctx: AudioContext, start: number, peak: number, attack: number, decay: number) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  gain.connect(ctx.destination);
  return gain;
}

/** A card sliding: a short burst of band-passed noise. */
function swish(ctx: AudioContext, start: number, frequency: number): void {
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 1.2;
  noise.connect(filter).connect(envelope(ctx, start, 0.25, 0.01, 0.07));
  noise.start(start);
  noise.stop(start + 0.09);
}

/** A card landing on the table: a quick falling sine. */
function tock(ctx: AudioContext, start: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(620, start);
  osc.frequency.exponentialRampToValueAtTime(240, start + 0.09);
  osc.connect(envelope(ctx, start, 0.3, 0.005, 0.14));
  osc.start(start);
  osc.stop(start + 0.16);
}

/** A Take: a low, wobbling, falling sawtooth that sounds a bit like a disgruntled bull. */
function moo(ctx: AudioContext, start: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(170, start);
  osc.frequency.linearRampToValueAtTime(190, start + 0.15);
  osc.frequency.exponentialRampToValueAtTime(105, start + 0.65);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 6;
  const depth = ctx.createGain();
  depth.gain.value = 5;
  wobble.connect(depth).connect(osc.frequency);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, start);
  filter.frequency.exponentialRampToValueAtTime(350, start + 0.65);
  osc.connect(filter).connect(envelope(ctx, start, 0.22, 0.08, 0.6));
  for (const node of [osc, wobble]) {
    node.start(start);
    node.stop(start + 0.72);
  }
}
