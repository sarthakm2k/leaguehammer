import type { PlayerDetails } from './registrationApi';

export function PlayerFields({ value, onChange, disabled = false }: { value: PlayerDetails; onChange: (v: PlayerDetails) => void; disabled?: boolean }) {
  const field = (key: keyof PlayerDetails) => ({ value: value[key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange({ ...value, [key]: e.target.value }), disabled });
  return <div className="registration-fields">
    <label className="registration-wide">Full name<input {...field('name')} required minLength={2} maxLength={150} autoComplete="name" /></label>
    <label>Contact number<input {...field('phone')} required type="tel" minLength={7} maxLength={30} autoComplete="tel" placeholder="Include country code" /></label>
    <label>Email (optional)<input {...field('email')} type="email" maxLength={256} autoComplete="email" /></label>
    <label>Playing position<select {...field('position')}>{['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map(p => <option key={p}>{p}</option>)}</select></label>
    <label>Preferred foot<select {...field('preferredFoot')}><option value="">Not specified</option>{['Right', 'Left', 'Both'].map(p => <option key={p}>{p}</option>)}</select></label>
    <label>Age (optional)<input {...field('age')} type="number" min={10} max={70} inputMode="numeric" /></label>
  </div>;
}
