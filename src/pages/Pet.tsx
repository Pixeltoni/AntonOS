import { PageHeader, Panel, Progress } from '../components/ui';
import { usePet, useSecond } from '../components/pet';
import { countdown, petAge, petDeathAt, petFrame, petFullness, petMood, PET_MOODS } from '../lib/pet';

/** Knubbel, das Tamagotchi – derselbe wie im Haustier-Widget */
export function Pet() {
  const { pet, feed, hatch } = usePet();
  const now = useSecond();
  if (!pet) return <PageHeader title="Knubbel" />;

  const mood = petMood(pet, now);
  const info = PET_MOODS[mood];
  const t = now.getTime();
  const dead = mood === 'tot';

  return (
    <>
      <PageHeader title="Knubbel" subtitle="Dein Tamagotchi – auch als Widget auf dem Sperrbildschirm" />
      <Panel>
        <div className="pet-stage" style={{ color: info.color }} role="img" aria-label={info.text}>
          <span style={{ fontFamily: info.font }} aria-hidden="true">{petFrame(now)}</span>
        </div>
        <p className="pet-mood" style={{ color: info.color }}>{info.text}</p>
        {mood === 'krank' ? (
          <p className="pet-countdown">Stirbt in <strong>{countdown(petDeathAt(pet) - t)}</strong></p>
        ) : !dead ? (
          <div className="pet-full">
            <span>Satt</span>
            <Progress value={petFullness(pet, t) * 100} color={info.color} />
          </div>
        ) : null}
        <div className="pet-facts">
          <span>{dead ? `Wurde ${petAge(pet, t)} alt` : `Alter: ${petAge(pet, t)}`}</span>
          <span>{pet.meals === 1 ? '1 Mahlzeit' : `${pet.meals} Mahlzeiten`}</span>
        </div>
        {dead ? (
          <button type="button" className="primary wide" onClick={hatch}>Neues Ei schlüpfen lassen</button>
        ) : (
          <button type="button" className="primary wide" onClick={feed}>Füttern</button>
        )}
      </Panel>
      <Panel title="So geht's">
        <ul className="pet-help">
          <li>Nach dem Füttern mampft Knubbel und tanzt kurz.</li>
          <li>Bis 3 Stunden ist er froh, bis 8 normal, bis 16 hungrig, danach traurig.</li>
          <li>Nach 24 Stunden ohne Essen wird er krank – Füttern macht ihn gesund.</li>
          <li>Nach 48 Stunden stirbt er, dann schlüpft ein neues Ei.</li>
          <li>Von 23 bis 6 Uhr schläft er.</li>
        </ul>
      </Panel>
    </>
  );
}
