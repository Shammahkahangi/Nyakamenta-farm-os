/* Nyakamenta — homepage interactions + live data */
(function () {
  document.documentElement.className = 'js';

  // ── Sticky nav ────────────────────────────────────────────
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (window.scrollY > window.innerHeight * 0.7) nav.classList.add('solid');
    else nav.classList.remove('solid');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Scroll reveal ─────────────────────────────────────────
  let revealEls = [];
  const collect = () => { revealEls = [...document.querySelectorAll('.reveal:not(.in)')]; };
  const checkReveals = () => {
    const vh = window.innerHeight;
    for (const el of revealEls) {
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add('in');
    }
    revealEls = revealEls.filter((el) => !el.classList.contains('in'));
  };
  collect();
  checkReveals();
  window.addEventListener('scroll', checkReveals, { passive: true });
  window.addEventListener('resize', () => { collect(); checkReveals(); }, { passive: true });
  setTimeout(() => { document.querySelectorAll('.reveal:not(.in)').forEach((el) => el.classList.add('in')); }, 1600);

  // ── Mobile burger ─────────────────────────────────────────
  const burger = document.querySelector('.nav__burger');
  if (burger) burger.addEventListener('click', () => {
    const t = document.getElementById('experiences');
    if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth' });
  });

  // ── Live room availability ────────────────────────────────
  async function loadRooms() {
    const cards = document.querySelectorAll('[data-room-code]');
    if (!cards.length) return;
    try {
      const resp = await fetch('/api/public/rooms');
      if (!resp.ok) return;
      const units = await resp.json();
      const byCode = {};
      units.forEach((u) => { byCode[String(u.code || u.name || '').toLowerCase()] = u; });

      cards.forEach((card) => {
        const codeAttr = card.getAttribute('data-room-code').toLowerCase();
        // Match by code attr OR by first word of room name
        const unit = byCode[codeAttr] || units.find((u) =>
          String(u.name || '').toLowerCase().includes(codeAttr) ||
          codeAttr.includes(String(u.code || '').toLowerCase())
        );
        if (!unit) return;

        const avail = card.querySelector('[data-room-avail]');
        const rate  = card.querySelector('[data-room-rate]');
        const status = String(unit.status || '').toLowerCase();
        const isAvail = status === 'available' && !unit.active_bookings;

        if (avail) {
          avail.textContent = isAvail ? 'Available' : (status === 'occupied' ? 'Occupied' : unit.status);
          avail.style.color = isAvail ? 'var(--green)' : 'var(--clay)';
        }
        if (rate && unit.nightly_rate > 0) {
          const usd = Math.round(unit.nightly_rate / 3700); // rough UGX → USD display
          rate.textContent = unit.nightly_rate > 500
            ? `UGX ${Number(unit.nightly_rate).toLocaleString()}`
            : `$${unit.nightly_rate}`;
        }
      });
    } catch (_) { /* non-fatal — static fallback stays in place */ }
  }
  loadRooms();

  // ── Enquiry form → API ────────────────────────────────────
  const enquiryForm = document.getElementById('enquiry-form');
  if (enquiryForm) {
    enquiryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = enquiryForm.querySelector('button[type="submit"]');
      const origText = btn.innerHTML;

      // Collect fields
      const name    = (enquiryForm.querySelector('[name="name"]')?.value || '').trim();
      const phone   = (enquiryForm.querySelector('[name="phone"]')?.value || '').trim();
      const guests  = enquiryForm.querySelector('[name="guests"]')?.value || '1';
      const checkin = enquiryForm.querySelector('[name="check_in"]')?.value || '';
      const checkout= enquiryForm.querySelector('[name="check_out"]')?.value || '';
      const message = (enquiryForm.querySelector('[name="message"]')?.value || '').trim();

      if (!name) {
        const nameInput = enquiryForm.querySelector('[name="name"]');
        if (nameInput) { nameInput.focus(); nameInput.style.borderColor = 'var(--clay)'; }
        return;
      }

      btn.disabled = true;
      btn.innerHTML = 'Sending…';

      try {
        const resp = await fetch('/api/public/enquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, guests, check_in: checkin, check_out: checkout, message }),
        });
        const data = await resp.json();
        if (data.ok) {
          btn.innerHTML = 'Sent — webaramu! ✓';
          btn.style.background = 'var(--green)';
          enquiryForm.reset();
        } else {
          btn.innerHTML = origText;
          btn.disabled = false;
          alert(data.error || 'Something went wrong. Please try again.');
        }
      } catch (_) {
        btn.innerHTML = origText;
        btn.disabled = false;
        alert('Could not send — please check your connection and try again.');
      }
    });
  }
})();
