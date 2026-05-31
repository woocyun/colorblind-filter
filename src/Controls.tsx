import { ConeScores } from './colorMath';

interface Props {
  scores: ConeScores;
  onChange: (next: ConeScores) => void;
  disabledHint: boolean;
}

interface ConeFieldProps {
  label: string;
  sub: string;
  value: number;
  onChange: (v: number) => void;
}

function clampScore(v: number): number {
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

function ConeField({ label, sub, value, onChange }: ConeFieldProps) {
  return (
    <div className="cone-field">
      <div className="cone-label-row">
        <label htmlFor={`cone-${label}`}>
          <span className="cone-label">{label}</span>{' '}
          <span className="cone-sub">{sub}</span>
        </label>
        <span className="cone-value">{value}</span>
      </div>
      <div className="cone-inputs">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(clampScore(Number(e.target.value)))}
          aria-label={`${label} ${sub} slider`}
        />
        <input
          id={`cone-${label}`}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(clampScore(Number(e.target.value)))}
        />
      </div>
    </div>
  );
}

export default function Controls({ scores, onChange, disabledHint }: Props) {
  return (
    <section className="controls">
      <div className="blurb">
        <p>
          This simulator is calibrated from EnChroma color blindness test
          results. If you haven&apos;t taken it, do that first at{' '}
          <a
            href="https://enchroma.com/pages/test"
            target="_blank"
            rel="noopener noreferrer"
          >
            enchroma.com/pages/test
          </a>
          , then enter your three cone scores below. The test reports L-cone
          (red), M-cone (green), and S-cone (blue) sensitivity as percentages.
        </p>
      </div>

      {disabledHint && (
        <p className="hint">
          Adjust these now — they&apos;ll take effect as soon as you upload an
          image.
        </p>
      )}

      <ConeField
        label="Red cone"
        sub="(L)"
        value={scores.red}
        onChange={(v) => onChange({ ...scores, red: v })}
      />
      <ConeField
        label="Green cone"
        sub="(M)"
        value={scores.green}
        onChange={(v) => onChange({ ...scores, green: v })}
      />
      <ConeField
        label="Blue cone"
        sub="(S)"
        value={scores.blue}
        onChange={(v) => onChange({ ...scores, blue: v })}
      />
    </section>
  );
}
