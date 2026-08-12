/* ============================================================
   STYLE GUIDE
   The color swatches are parsed live from style.css's :root block
   at render time, so they can never drift from the real palette.
   The component showcase below reuses the app's real CSS classes
   for the same reason — if style.css changes, this view changes
   with it automatically. The hand-written labels/grouping are the
   one thing that needs a manual touch-up if tokens are renamed.
   ============================================================ */
let styleGuideRendered = false;

async function fetchRootTokens_(){
  const res = await fetch('style.css');
  if(!res.ok) throw new Error('Could not load style.css');
  const css = await res.text();
  const match = css.match(/:root\s*\{([^}]*)\}/);
  if(!match) return [];
  return match[1].split(';')
    .map(line => line.trim())
    .filter(line => line.startsWith('--'))
    .map(line => {
      const idx = line.indexOf(':');
      return { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    });
}

function isColorValue_(v){
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v);
}

function swatchHtml_(tokens){
  return tokens.map(t => `
    <div class="sg-swatch">
      <div class="sg-swatch-color" style="background:${escapeHtml(t.value)}"></div>
      <code class="sg-swatch-name">--${escapeHtml(t.name.replace(/^--/,''))}</code>
      <span class="sg-swatch-value">${escapeHtml(t.value)}</span>
    </div>`).join('');
}

async function renderStyleGuide(){
  const root = document.getElementById('styleguideView');
  if(!root) return;

  let tokenSection = '<p class="sg-error">Could not load style.css to read the live palette — the rest of this page still reflects the real CSS classes.</p>';
  try{
    const tokens = await fetchRootTokens_();
    const typeTokens = tokens.filter(t => t.name.startsWith('--t-'));
    const otherTokens = tokens.filter(t => !t.name.startsWith('--t-') && isColorValue_(t.value));
    const nonColorTokens = tokens.filter(t => !isColorValue_(t.value));
    tokenSection = `
      <div class="sg-section">
        <h3>Base palette</h3>
        <div class="sg-swatch-grid">${swatchHtml_(otherTokens)}</div>
      </div>
      <div class="sg-section">
        <h3>Type colors</h3>
        <div class="sg-swatch-grid">${swatchHtml_(typeTokens)}</div>
      </div>
      <div class="sg-section">
        <h3>Other tokens</h3>
        <div class="sg-token-list">
          ${nonColorTokens.map(t => `<div class="sg-token-row"><code>--${escapeHtml(t.name.replace(/^--/,''))}</code><span>${escapeHtml(t.value)}</span></div>`).join('')}
        </div>
      </div>`;
  }catch(e){}

  root.innerHTML = `
    <div class="sg-wrap">
      ${tokenSection}

      <div class="sg-section">
        <h3>Typography</h3>
        <div class="sg-type-sample" style="font-family:var(--font-display);">
          <h1 style="margin:0;">Palpedia Field Tracker</h1>
          <p class="eyebrow" style="margin:6px 0 0;">Display font — Space Grotesk</p>
        </div>
        <div class="sg-type-sample" style="font-family:var(--font-mono); margin-top:10px;">
          <div style="font-size:18px;">№001 · palId · JetBrains Mono</div>
          <p class="eyebrow" style="margin:6px 0 0;">Monospace font — used for ids, codes, labels</p>
        </div>
      </div>

      <div class="sg-section">
        <h3>Buttons</h3>
        <div class="sg-row">
          <button class="chip-toggle" type="button">Chip toggle</button>
          <button class="save-btn" type="button">Save button</button>
          <button class="reset-btn" type="button">Reset button</button>
        </div>
        <div class="role-row" style="max-width:220px; margin-top:10px;">
          <button class="role-btn base on" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path></svg>Base (on)</button>
          <button class="role-btn party" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18M5 4h13l-2.5 4L18 12H5"></path></svg>Party</button>
        </div>
      </div>

      <div class="sg-section">
        <h3>Badges &amp; pills</h3>
        <div class="sg-row">
          <span class="type-pill" style="background:var(--t-FI)">Fire</span>
          <span class="type-pill" style="background:var(--t-WA)">Water</span>
          <span class="type-pill ghost">?</span>
          ${rankBadgeHtml(3)}
          ${rankBadgeHtml(-2)}
          <span class="surgery-badge">Surgery</span>
          <span>${GENDER_ICONS.male} Male</span>
          <span>${GENDER_ICONS.female} Female</span>
        </div>
      </div>

      <div class="sg-section">
        <h3>Card</h3>
        <div class="sg-card-demo">
          <div class="card discovered" style="max-width:210px;">
            <div class="card-top">
              <span class="pal-no">№001</span>
              <button class="discover-check on" type="button"><svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
            </div>
            <div class="pal-image-box empty" style="pointer-events:none;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-5-5L5 21"></path></svg>
              <span>Add a picture</span>
            </div>
            <div class="pal-name">Lamball</div>
            <div class="type-row"><span class="type-pill" style="background:var(--t-NE)">Neutral</span></div>
            <div class="partner-block"><div class="partner-label">Partner Skill</div><div class="partner-name">Fluffy Shield</div><div class="partner-desc">Reduces damage taken while riding.</div></div>
            <div class="role-row">
              <button class="role-btn base" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path></svg>Base</button>
              <button class="role-btn party" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18M5 4h13l-2.5 4L18 12H5"></path></svg>Party</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}
