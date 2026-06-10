/* Nyakamenta — Tweaks panel
   Drives the static page via data-attributes / CSS vars on <html>. */

const NYK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "hero": "fullbleed",
  "palette": "earth",
  "display": "cormorant",
  "accent": "clay"
}/*EDITMODE-END*/;

function applyTweaks(t) {
  const root = document.documentElement;
  root.setAttribute('data-hero', t.hero);
  if (t.palette === 'earth') root.removeAttribute('data-palette');
  else root.setAttribute('data-palette', t.palette);
  if (t.display === 'cormorant') root.removeAttribute('data-display');
  else root.setAttribute('data-display', t.display);
  // Accent: primary CTA hue. Map to the relevant accent var.
  const accents = {
    clay:  'var(--clay)',
    green: 'var(--green)',
    gold:  'var(--gold)',
  };
  // Re-point .btn--clay style by overriding --clay-cta consumers via a style tag.
  let s = document.getElementById('nyk-accent-style');
  if (!s) { s = document.createElement('style'); s.id = 'nyk-accent-style'; document.head.appendChild(s); }
  const a = accents[t.accent] || accents.clay;
  s.textContent = `.btn--clay{--bg:${a};} .story__pull{border-left-color:${a};} .contact__pin .dot{background:${a};}`;
  localStorage.setItem('nyk_hero', t.hero);
  if (window.__nykObserveReveals) window.__nykObserveReveals();
}

function NyakamentaTweaks() {
  const [t, setTweak] = useTweaks(NYK_DEFAULTS);
  React.useEffect(() => { applyTweaks(t); }, [t.hero, t.palette, t.display, t.accent]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Hero layout" />
      <TweakRadio
        label="Style"
        value={t.hero}
        options={["fullbleed", "split", "centered"]}
        onChange={(v) => setTweak('hero', v)}
      />
      <p style={{ font: '11px var(--mono, monospace)', opacity: 0.55, margin: '2px 2px 4px', lineHeight: 1.4 }}>
        Full-bleed photo · split editorial · centered minimal
      </p>

      <TweakSection label="Palette" />
      <TweakColor
        label="Mood"
        value={t.palette === 'earth' ? ['#3a2f1e','#6b4a2e','#efe7d6'] : t.palette === 'forest' ? ['#1c2a1f','#2f6b3e','#e6edd9'] : ['#3a241a','#a85a2e','#f2e6d6']}
        options={[
          ['#3a2f1e','#6b4a2e','#efe7d6'],
          ['#1c2a1f','#2f6b3e','#e6edd9'],
          ['#3a241a','#a85a2e','#f2e6d6'],
        ]}
        onChange={(v) => setTweak('palette', v[0] === '#1c2a1f' ? 'forest' : v[0] === '#3a241a' ? 'clay' : 'earth')}
      />

      <TweakSection label="Accent" />
      <TweakColor
        label="Buttons"
        value={t.accent === 'clay' ? '#a85a2e' : t.accent === 'green' ? '#2f7d4f' : '#c79a4a'}
        options={['#a85a2e', '#2f7d4f', '#c79a4a']}
        onChange={(v) => setTweak('accent', v === '#2f7d4f' ? 'green' : v === '#c79a4a' ? 'gold' : 'clay')}
      />

      <TweakSection label="Display type" />
      <TweakRadio
        label="Headline"
        value={t.display}
        options={["cormorant", "spectral", "marcellus"]}
        onChange={(v) => setTweak('display', v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<NyakamentaTweaks />);
