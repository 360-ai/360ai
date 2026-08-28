const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.addEventListener('pointermove', (event) => {
  root.style.setProperty('--mouse-x', `${event.clientX}px`);
  root.style.setProperty('--mouse-y', `${event.clientY}px`);
}, { passive: true });

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
}, { threshold: 0.14 });
document.querySelectorAll('.reveal').forEach((item) => observer.observe(item));

// --- Hero: a direct choice of contact channel before a longer request flow ---
const heroContactButton = document.querySelector('[data-hero-contact-choice]');
const heroContactOptions = document.getElementById('hero-contact-options');
if (heroContactButton && heroContactOptions) {
  heroContactButton.addEventListener('click', () => {
    const willOpen = heroContactOptions.hidden;
    heroContactOptions.hidden = !willOpen;
    heroContactButton.setAttribute('aria-expanded', String(willOpen));
    heroContactButton.classList.toggle('is-open', willOpen);
  });
}

// --- Kontaktabschluss: Wege erscheinen erst als bewusster nächster Schritt ---
const contactSection = document.querySelector('.contact');
if (contactSection) {
  if (!reduceMotion) contactSection.classList.add('has-contact-motion');
  const contactRoutes = contactSection.querySelector('[data-contact-routes]');
  const contactClarity = contactSection.querySelector('#contact-title');
  const contactClarityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      window.setTimeout(() => contactSection.classList.add('is-clarity'), 420);
      contactClarityObserver.unobserve(entry.target);
    });
  }, { threshold: .7, rootMargin: '0px 0px -12% 0px' });
  contactClarityObserver.observe(contactClarity || contactSection);
  const contactObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) contactSection.classList.add('is-engaged');
    });
  }, { threshold: .58, rootMargin: '0px 0px -10% 0px' });
  contactObserver.observe(contactRoutes || contactSection);

  const value = (form, name) => form.elements[name]?.value.trim() || '';
  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    if (!copied) throw new Error('copy-failed');
  };
  const showContactFallback = (form, text, hint) => {
    const fallback = form.querySelector('[data-contact-fallback]');
    if (!fallback) return;
    fallback.querySelector('[data-contact-fallback-text]').value = text;
    fallback.querySelector('[data-contact-fallback-hint]').textContent = hint;
    fallback.querySelector('[data-contact-copy-status]').textContent = '';
    fallback.hidden = false;
  };
  contactSection.querySelectorAll('[data-contact-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const fallback = button.closest('[data-contact-fallback]');
      const text = fallback?.querySelector('[data-contact-fallback-text]')?.value || '';
      const status = fallback?.querySelector('[data-contact-copy-status]');
      try {
        await copyText(text);
        if (status) status.textContent = 'Kopiert.';
      } catch {
        if (status) status.textContent = 'Bitte markieren und manuell kopieren.';
      }
    });
  });
  const emailForm = contactSection.querySelector('[data-contact-email]');
  emailForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!emailForm.reportValidity()) return;
    const name = value(emailForm, 'name');
    const email = value(emailForm, 'email');
    const message = value(emailForm, 'message');
    const body = [`Hallo 360ai,`, '', `mein Name ist ${name}.`, `Meine E-Mail-Adresse: ${email}.`, message ? `\nMein Anliegen:\n${message}` : ''].filter(Boolean).join('\n');
    showContactFallback(emailForm, body, 'Ihre Nachricht ist gesichert. Falls sich kein Mail-Programm öffnet, kopieren Sie den Text einfach.');
    window.location.href = `mailto:info@360-ai.org?subject=${encodeURIComponent('KI-Erstgespräch anfragen')}&body=${encodeURIComponent(body)}`;
  });

  const whatsappForm = contactSection.querySelector('[data-contact-whatsapp]');
  whatsappForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!whatsappForm.reportValidity()) return;
    const name = value(whatsappForm, 'name');
    const company = value(whatsappForm, 'company');
    const message = value(whatsappForm, 'message');
    const text = [`Hallo 360ai,`, '', `ich bin ${name}${company ? ` von ${company}` : ''}.`, message || 'Ich würde gern kurz über mein Anliegen sprechen.'].join('\n');
    showContactFallback(whatsappForm, text, 'Ihre Nachricht ist gesichert. Falls WhatsApp nicht öffnet, kopieren Sie den Text einfach.');
    window.open(`https://wa.me/4915229239908?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });
}

// --- Gedankengang unter dem Hero: eine ruhige, klickbare Kartenfächerung ---
const statement = document.querySelector('[data-statement]');
const statementCards = [...document.querySelectorAll('[data-statement-card]')];
if (statement && statementCards.length) {
  let activeStatementCard = 0;
  let lastStatementAdvance = 0;
  const statementCount = statement.querySelector('[data-statement-count]');
  const setStatementCard = (index) => {
    activeStatementCard = (index + statementCards.length) % statementCards.length;
    statementCards.forEach((card, cardIndex) => {
      card.classList.toggle('is-active', cardIndex === activeStatementCard);
      const distance = (cardIndex - activeStatementCard + statementCards.length) % statementCards.length;
      card.classList.toggle('is-right', distance === 1);
      card.classList.toggle('is-left', distance === statementCards.length - 1);
    });
    if (statementCount) statementCount.textContent = String(activeStatementCard + 1).padStart(2, '0');
  };
  statement.querySelector('[data-statement-next]')?.addEventListener('click', () => setStatementCard(activeStatementCard + 1));
  statement.querySelector('[data-statement-prev]')?.addEventListener('click', () => setStatementCard(activeStatementCard - 1));
  statementCards.forEach((card, index) => card.addEventListener('click', () => {
    if (index !== activeStatementCard) setStatementCard(index);
  }));
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('wheel', (event) => {
      const rect = statement.getBoundingClientRect();
      const isCentered = rect.top < window.innerHeight * .3 && rect.bottom > window.innerHeight * .7;
      if (!isCentered || !event.deltaY) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      const isLeaving = (direction > 0 && activeStatementCard === statementCards.length - 1) || (direction < 0 && activeStatementCard === 0);
      if (isLeaving) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastStatementAdvance < 750) return;
      lastStatementAdvance = now;
      setStatementCard(activeStatementCard + direction);
    }, { passive: false });
  }
  setStatementCard(0);
}

// --- Ansatz: genau ein aktiver Punkt folgt der Scroll-Position ---
const methodSteps = [...document.querySelectorAll('[data-method-step]')];
if (methodSteps.length) {
  let methodFrame;
  const updateMethodFocus = () => {
    methodFrame = undefined;
    const focusLine = window.innerHeight * 0.47;
    const nearest = methodSteps.reduce((closest, step) => {
      const distance = Math.abs(step.getBoundingClientRect().top + step.offsetHeight / 2 - focusLine);
      return !closest || distance < closest.distance ? { step, distance } : closest;
    }, null);
    methodSteps.forEach((step) => step.classList.toggle('is-active', step === nearest.step));
  };
  const requestMethodFocus = () => {
    if (!methodFrame) methodFrame = requestAnimationFrame(updateMethodFocus);
  };
  window.addEventListener('scroll', requestMethodFocus, { passive: true });
  window.addEventListener('resize', requestMethodFocus);
  requestMethodFocus();
}

// --- Angebote: fünf Karten, per Scrollen oder Klick bewusst weiterschalten ---
const servicesSection = document.querySelector('.services');
const offerItems = [...document.querySelectorAll('[data-offer-item]')];
if (servicesSection && offerItems.length) {
  const offerStage = servicesSection.querySelector('.offer-stage');
  let activeOffer = 0;
  let lastOfferAdvance = 0;
  let offerIsAnimating = false;
  let readinessNeedsExtraScroll = true;
  let offerCarouselEngaged = false;
  let offerCarouselReleasedDirection = 0;
  let offerBoundaryHoldUntil = 0;
  const count = document.querySelector('[data-offer-count]');
  const setOffer = (index, force = false) => {
    if (offerIsAnimating && !force) return false;
    offerIsAnimating = true;
    activeOffer = (index + offerItems.length) % offerItems.length;
    if (activeOffer !== 0 && activeOffer !== offerItems.length - 1) offerCarouselReleasedDirection = 0;
    if (activeOffer === 0) readinessNeedsExtraScroll = true;
    if (activeOffer === 0 || activeOffer === offerItems.length - 1) {
      offerBoundaryHoldUntil = performance.now() + 950;
    }
    offerItems.forEach((item, index) => {
      item.classList.toggle('is-active', index === activeOffer);
      const distance = (index - activeOffer + offerItems.length) % offerItems.length;
      item.classList.toggle('is-right-1', distance === 1);
      item.classList.toggle('is-right-2', distance === 2);
      item.classList.toggle('is-left-1', distance === offerItems.length - 1);
      item.classList.toggle('is-left-2', distance === offerItems.length - 2);
    });
    if (count) count.textContent = String(activeOffer + 1).padStart(2, '0');
    window.setTimeout(() => { offerIsAnimating = false; }, 760);
    return true;
  };
  const galleryIsInFocus = (direction = 1) => {
    if (!offerStage) return false;
    if (offerCarouselReleasedDirection === direction) return false;
    if (offerCarouselReleasedDirection && offerCarouselReleasedDirection !== direction) offerCarouselReleasedDirection = 0;
    const rect = offerStage.getBoundingClientRect();
    // Die Bühne wird erst übernommen, wenn Karte 1 weitgehend sichtbar ist.
    // Danach ist sie eine feste, eigene Scroll-Phase – unabhängig davon,
    // wie schnell ein Trackpad weitere Wheel-Events sendet.
    const isApproachingFromAbove = direction > 0
      && rect.top < window.innerHeight * .68
      && rect.bottom > window.innerHeight * .14;
    const isReturningFromBelow = direction < 0
      && rect.top < window.innerHeight * .86
      && rect.bottom > -window.innerHeight * .2;
    if (!offerCarouselEngaged && (isApproachingFromAbove || isReturningFromBelow)) {
      offerCarouselEngaged = true;
      const cardNeedsCentering = rect.top > window.innerHeight * .1 || rect.bottom < window.innerHeight * .9;
      if (cardNeedsCentering) {
        offerStage.scrollIntoView({ block: 'center', behavior: 'smooth' });
        lastOfferAdvance = performance.now();
      }
    }
    return offerCarouselEngaged;
  };
  document.querySelector('[data-offer-next]')?.addEventListener('click', () => setOffer(activeOffer + 1));
  document.querySelector('[data-offer-prev]')?.addEventListener('click', () => setOffer(activeOffer - 1));
  offerItems.forEach((item, index) => {
    item.addEventListener('click', (event) => {
      if (index === activeOffer || event.target.closest('button')) return;
      setOffer(index);
    });
  });
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('wheel', (event) => {
      if (!event.deltaY) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      if (!galleryIsInFocus(direction)) return;
      const now = performance.now();
      const isLeavingAtBoundary = (direction > 0 && activeOffer === offerItems.length - 1) || (direction < 0 && activeOffer === 0);
      if (isLeavingAtBoundary) {
        if (now < offerBoundaryHoldUntil) event.preventDefault();
        else {
          offerCarouselEngaged = false;
          offerCarouselReleasedDirection = direction;
        }
        return;
      }
      // Auch während der Übergangspause bleibt der Scrollimpuls in der Galerie.
      // Ohne dieses Abfangen würde die Seite zwischen zwei Karten weiterlaufen.
      if (offerIsAnimating || now - lastOfferAdvance < 950) {
        event.preventDefault();
        return;
      }
      // Die Potenzialanalyse ist das Hauptangebot: ein zusätzlicher Scrollschritt
      // lässt genug Zeit, um Inhalt und CTAs vollständig wahrzunehmen.
      if (direction > 0 && activeOffer === 0 && readinessNeedsExtraScroll) {
        event.preventDefault();
        readinessNeedsExtraScroll = false;
        lastOfferAdvance = now;
        return;
      }
      event.preventDefault();
      lastOfferAdvance = now;
      setOffer(activeOffer + direction);
    }, { passive: false });
  }
  setOffer(0, true);
}

// --- Angebotsdetails: ein Dialog, der die passende Leistung konkret macht ---
const offerDialog = document.getElementById('offer-dialog');
if (offerDialog) {
  const dialogTitle = offerDialog.querySelector('[data-offer-dialog-title]');
  const dialogDescription = offerDialog.querySelector('[data-offer-dialog-description]');
  const dialogPoints = offerDialog.querySelector('[data-offer-dialog-points]');
  const dialogRequest = offerDialog.querySelector('[data-offer-dialog-request]');
  let requestedOffer = '';
  const closeOfferDialog = () => {
    if (typeof offerDialog.close === 'function') offerDialog.close();
    else offerDialog.removeAttribute('open');
    document.body.classList.remove('offer-dialog-open');
  };
  document.querySelectorAll('[data-open-offer-info]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-offer-item]');
      if (!card) return;
      requestedOffer = card.dataset.title || '';
      dialogTitle.textContent = requestedOffer;
      dialogDescription.textContent = card.dataset.description || '';
      dialogPoints.replaceChildren();
      (card.dataset.points || '').split('|').filter(Boolean).forEach((point) => {
        const item = document.createElement('li');
        item.textContent = point;
        dialogPoints.append(item);
      });
      if (typeof offerDialog.showModal === 'function') offerDialog.showModal();
      else offerDialog.setAttribute('open', '');
      document.body.classList.add('offer-dialog-open');
      offerDialog.querySelector('[data-close-offer-info]')?.focus();
    });
  });
  offerDialog.querySelector('[data-close-offer-info]')?.addEventListener('click', closeOfferDialog);
  offerDialog.addEventListener('click', (event) => { if (event.target === offerDialog) closeOfferDialog(); });
  offerDialog.addEventListener('close', () => document.body.classList.remove('offer-dialog-open'));
  dialogRequest?.addEventListener('click', () => {
    closeOfferDialog();
    const requestButton = [...document.querySelectorAll('[data-open-anfrage]')].find((button) => button.dataset.anliegen === requestedOffer);
    requestButton?.click();
  });
}

// --- Über uns: die Zertifizierung erscheint als einzelner Vertrauensmoment ---
const aboutSection = document.querySelector('.about');
if (aboutSection) {
  const qualification = aboutSection.querySelector('.qualification');
  if (qualification && !reduceMotion) {
    aboutSection.classList.add('has-qualification-motion');
    const qualificationObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        aboutSection.classList.add('is-qualification-visible');
        qualificationObserver.unobserve(entry.target);
      });
    }, { threshold: .72 });
    qualificationObserver.observe(qualification);
  }
}

// --- Zertifikate: drei Originalnachweise als gezielt auswählbare Folge ---
document.querySelectorAll('[data-certificate-carousel]').forEach((carousel) => {
  const certificates = [...carousel.querySelectorAll('[data-certificate]')];
  const tabs = [...carousel.querySelectorAll('[data-certificate-tab]')];
  const count = carousel.querySelector('[data-certificate-count]');
  let activeCertificate = 0;
  const setCertificate = (index) => {
    activeCertificate = (index + certificates.length) % certificates.length;
    certificates.forEach((certificate, certificateIndex) => certificate.classList.toggle('is-active', certificateIndex === activeCertificate));
    tabs.forEach((tab, tabIndex) => {
      const isActive = tabIndex === activeCertificate;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    if (count) count.textContent = String(activeCertificate + 1).padStart(2, '0');
  };
  carousel.querySelector('[data-certificate-prev]')?.addEventListener('click', () => setCertificate(activeCertificate - 1));
  carousel.querySelector('[data-certificate-next]')?.addEventListener('click', () => setCertificate(activeCertificate + 1));
  tabs.forEach((tab, index) => tab.addEventListener('click', () => setCertificate(index)));
});

// --- FAQ: eine offene Antwort hält die Orientierung ruhig ---
document.querySelectorAll('[data-faq-list] .faq-item button').forEach((button) => {
  button.addEventListener('click', () => {
    const item = button.closest('.faq-item');
    const willOpen = !item.classList.contains('is-open');
    document.querySelectorAll('[data-faq-list] .faq-item').forEach((entry) => {
      entry.classList.remove('is-open');
      entry.querySelector('button').setAttribute('aria-expanded', 'false');
    });
    if (willOpen) {
      item.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
    }
  });
});

// --- Wortwechsel im Hero-Slogan ---
if (!reduceMotion) {
  document.querySelectorAll('.word-rotator').forEach((el) => {
    const words = (el.dataset.words || '').split(',').map((w) => w.trim()).filter(Boolean);
    const em = el.querySelector('em');
    if (!em || words.length < 2) return;
    const hero = el.closest('.hero');
    let i = 0;
    let lastHeroWordChange = 0;
    const applyHeroWord = () => {
      em.classList.remove('swap');
      void em.offsetWidth;
      em.textContent = words[i];
      em.classList.add('swap');
      if (hero) {
        hero.dataset.heroTone = words[i].toLowerCase();
        hero.dataset.heroStep = String(i);
      }
    };
    applyHeroWord();
    const advanceHeroWord = (dir) => {
      i = (i + dir + words.length) % words.length;
      applyHeroWord();
    };
    let autoTimer = setInterval(() => advanceHeroWord(1), 3000);
    const restartAuto = () => {
      clearInterval(autoTimer);
      autoTimer = setInterval(() => advanceHeroWord(1), 3000);
    };
    window.addEventListener('wheel', (event) => {
      if (!hero || !event.deltaY) return;
      const rect = hero.getBoundingClientRect();
      const now = performance.now();
      const heroIsInFocus = rect.top < window.innerHeight * .12 && rect.bottom > window.innerHeight * .72;
      if (!heroIsInFocus) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      const isLeavingHero = (direction > 0 && i === words.length - 1) || (direction < 0 && i === 0);
      if (isLeavingHero) return;
      event.preventDefault();
      if (now - lastHeroWordChange < 700) return;
      lastHeroWordChange = now;
      advanceHeroWord(direction);
      restartAuto();
    }, { passive: false });
  });
}

// --- Drahtgitter-Kugel im Hero: Maus-Parallax (Tilt) ---
const sphereTilt = document.getElementById('sphereTilt');
if (sphereTilt && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  const maxTilt = 10;

  window.addEventListener('pointermove', (event) => {
    const relX = event.clientX / window.innerWidth - 0.5;
    const relY = event.clientY / window.innerHeight - 0.5;
    targetY = relX * maxTilt;
    targetX = -relY * maxTilt;
  }, { passive: true });

  const lerp = (a, b, t) => a + (b - a) * t;
  const tick = () => {
    currentX = lerp(currentX, targetX, 0.08);
    currentY = lerp(currentY, targetY, 0.08);
    sphereTilt.style.setProperty('--tilt-x', `${currentX.toFixed(2)}deg`);
    sphereTilt.style.setProperty('--tilt-y', `${currentY.toFixed(2)}deg`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// --- Mobile-Navigation: Hamburger-Menü ---
const navToggle = document.querySelector('.nav-toggle');
const mobileNav = document.getElementById('mobile-nav');
if (navToggle && mobileNav) {
  const setNav = (open) => {
    document.body.classList.toggle('nav-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
  };
  navToggle.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
  mobileNav.querySelectorAll('a, button').forEach((el) => el.addEventListener('click', () => setNav(false)));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setNav(false); });
  window.matchMedia('(min-width: 761px)').addEventListener('change', (event) => { if (event.matches) setNav(false); });
}

// --- Anfrage-Fenster ---
const anfrageDialog = document.getElementById('anfrage-dialog');
if (anfrageDialog) {
  const form = anfrageDialog.querySelector('[data-anfrage-form]');
  const steps = [...form.querySelectorAll('fieldset[data-step]')];
  const successPane = anfrageDialog.querySelector('[data-success]');
  const progressBar = anfrageDialog.querySelector('[data-progress]');
  const stepLabel = anfrageDialog.querySelector('[data-step-count]');
  const progressWrap = anfrageDialog.querySelector('.anfrage-progress');
  let current = 0;

  const supportsDialog = typeof anfrageDialog.showModal === 'function';

  function showError(name, show) {
    const el = form.querySelector(`[data-error-for="${name}"]`);
    if (el) el.hidden = !show;
  }

  function render() {
    steps.forEach((s, i) => { s.hidden = i !== current; });
    progressBar.style.transform = `scaleX(${(current + 1) / steps.length})`;
    stepLabel.textContent = `Schritt ${current + 1} von ${steps.length}`;
  }

  function validateStep(index) {
    if (index === 0) {
      const checked = form.querySelector('input[name="anliegen"]:checked');
      showError('anliegen', !checked);
      return !!checked;
    }
    if (index === 1) {
      const name = form.querySelector('#af-name');
      const email = form.querySelector('#af-email');
      const nameOk = name.value.trim().length > 0;
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
      showError('name', !nameOk);
      showError('email', !emailOk);
      if (!nameOk) name.focus();
      else if (!emailOk) email.focus();
      return nameOk && emailOk;
    }
    return true;
  }

  function resetDialog() {
    current = 0;
    form.hidden = false;
    progressWrap.hidden = false;
    stepLabel.hidden = false;
    successPane.hidden = true;
    form.reset();
    ['anliegen', 'name', 'email'].forEach((n) => showError(n, false));
    render();
  }

  function openDialog(presetAnliegen) {
    resetDialog();
    if (presetAnliegen) {
      const radio = form.querySelector(`input[name="anliegen"][value="${CSS.escape(presetAnliegen)}"]`);
      if (radio) radio.checked = true;
    }
    if (supportsDialog) anfrageDialog.showModal();
    else anfrageDialog.setAttribute('open', '');
    document.body.classList.add('anfrage-open');
    setTimeout(() => {
      const focusTarget = form.querySelector('input[name="anliegen"]:checked') || form.querySelector('input[name="anliegen"]');
      focusTarget?.focus();
    }, 50);
  }

  function closeDialog() {
    if (supportsDialog) anfrageDialog.close();
    else anfrageDialog.removeAttribute('open');
    document.body.classList.remove('anfrage-open');
  }

  document.querySelectorAll('[data-open-anfrage]').forEach((btn) => {
    btn.addEventListener('click', () => openDialog(btn.dataset.anliegen));
  });
  anfrageDialog.querySelector('[data-close-anfrage]').addEventListener('click', closeDialog);
  anfrageDialog.addEventListener('click', (event) => {
    if (event.target === anfrageDialog) closeDialog();
  });
  anfrageDialog.addEventListener('close', () => document.body.classList.remove('anfrage-open'));

  form.querySelector('[data-next]').addEventListener('click', () => {
    if (!validateStep(current)) return;
    current += 1;
    render();
  });
  form.querySelector('[data-back]').addEventListener('click', () => {
    current -= 1;
    render();
  });

  function buildMail() {
    const anliegen = form.querySelector('input[name="anliegen"]:checked')?.value ?? '';
    const name = form.querySelector('#af-name').value.trim();
    const firma = form.querySelector('#af-firma').value.trim();
    const email = form.querySelector('#af-email').value.trim();
    const telefon = form.querySelector('#af-telefon').value.trim();
    const adresse = form.querySelector('#af-adresse').value.trim();
    const nachricht = form.querySelector('#af-nachricht').value.trim();

    const subject = `Anfrage: ${anliegen}`;
    const bodyLines = [
      `Anliegen: ${anliegen}`,
      `Name: ${name}`,
      firma ? `Firma: ${firma}` : '',
      `E-Mail: ${email}`,
      telefon ? `Telefon: ${telefon}` : '',
      adresse ? `Adresse: ${adresse}` : '',
      nachricht ? `\nNachricht:\n${nachricht}` : '',
    ].filter((line) => line !== '');
    const bodyText = bodyLines.join('\n');

    return {
      mailto: `mailto:info@360-ai.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`,
      mailText: `An: info@360-ai.org\nBetreff: ${subject}\n\n${bodyText}`,
    };
  }

  function showSuccess(mailText) {
    form.querySelectorAll('fieldset').forEach((s) => { s.hidden = true; });
    progressWrap.hidden = true;
    stepLabel.hidden = true;
    successPane.hidden = false;
    const mailTextArea = successPane.querySelector('[data-mail-text]');
    mailTextArea.value = mailText;
    successPane.querySelector('[data-success-heading]').focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!validateStep(1)) return;
    const { mailto, mailText } = buildMail();
    showSuccess(mailText);
    window.open(mailto, '_blank', 'noopener');
  });

  successPane.querySelector('[data-copy]').addEventListener('click', async () => {
    const mailTextArea = successPane.querySelector('[data-mail-text]');
    const status = successPane.querySelector('[data-copy-status]');
    mailTextArea.select();
    try {
      await navigator.clipboard.writeText(mailTextArea.value);
      status.textContent = 'In die Zwischenablage kopiert.';
    } catch {
      status.textContent = 'Kopieren fehlgeschlagen — Text ist markiert, bitte Strg+C.';
    }
  });

  render();
}
