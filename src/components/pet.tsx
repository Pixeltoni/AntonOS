import { useCallback, useEffect, useState } from 'react';
import { AntonWidgets, isNativeApp } from '../lib/native';
import { feedPet, hatchPet, parsePet, type PetState } from '../lib/pet';

/** Im Browser bleibt Knubbel auf dem Gerät; in der iPhone-App teilt er sich den Speicher mit dem Widget */
const KEY = 'antonos:knubbel';

function readLocal(): PetState | null {
  try {
    return parsePet(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return null;
  }
}

async function load(): Promise<PetState> {
  if (isNativeApp()) {
    try {
      const pet = parsePet(await AntonWidgets.getPet());
      if (pet) return pet;
    } catch {
      /* Plugin fehlt in alten Builds – dann wie im Browser */
    }
  }
  return readLocal() ?? hatchPet(Date.now());
}

async function save(pet: PetState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pet));
  } catch {
    /* privat/voll – egal */
  }
  if (isNativeApp()) await AntonWidgets.setPet(pet).catch(() => undefined);
}

/** Knubbels Zustand; lädt beim Zurückkehren in die App neu (vielleicht wurde im Widget gefüttert) */
export function usePet() {
  const [pet, setPet] = useState<PetState | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => void load().then((p) => {
      if (!alive) return;
      setPet(p);
      // Erstes Ei auch fürs Widget festhalten
      if (!readLocal()) void save(p);
    });
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const change = useCallback((next: PetState) => {
    setPet(next);
    void save(next);
  }, []);

  return {
    pet,
    feed: () => pet && change(feedPet(pet, Date.now())),
    hatch: () => change(hatchPet(Date.now())),
  };
}

/** Tickt jede Sekunde – für Animation und Countdown */
export function useSecond(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
