/*
  Eden Raine clothing for the Apntly booking modal.

  Apntly draws its calendar in an iframe it appends to <body>, and that iframe is a `srcdoc`
  one: same origin as the page, so its document is ours to reach into. That is the only way
  in. The app's own "custom CSS" box in its admin goes through addStyleElement(), which
  appends a <style> to the *parent* document's head - styles there cannot cross into an
  iframe document, same origin or not, so the box can only reach the floating button and the
  iframe element itself, never the calendar inside it.

  Hence a stylesheet as a string rather than a file in assets/: it is injected into another
  document, so it can never be a <link> the theme serves. The fonts have to travel too -
  a srcdoc iframe inherits the origin but not the parent's stylesheets - so the @font-face
  rules the theme already prints in snippets/global-style.liquid are copied across with it.

  Apntly removes the iframe when the modal closes and builds a new one next time, so the
  observer below stays armed for the life of the page rather than running once.

  The modal's own look is a Vue app styled inline inside that srcdoc: rounded corners, a
  purple #6A42C8 and a blue #3182ce for the chosen day. Everything here is an override of
  those, scoped to body.apntly-modal-container so it can only ever apply inside the modal.
*/

(() => {
  const MARK = 'data-eden-skin';

  /*
    The theme's webfonts come from snippets/global-style.liquid as an inline <style>, which is
    same-origin and readable. Any sheet that is not (a stylesheet on a CDN) throws on .cssRules
    and is skipped - the stack below it still gives the modal a reasonable face.
  */
  const fontFaces = () => {
    let css = '';
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (rule.constructor.name === 'CSSFontFaceRule') css += rule.cssText + '\n';
      }
    }
    return css;
  };

  const familyOf = (el, fallback) => {
    const found = el && getComputedStyle(el).fontFamily;
    return found || fallback;
  };

  const skin = () => {
    const body = familyOf(document.body, 'Georgia, serif');
    const heading = familyOf(document.querySelector('h1, h2, .h1, .h2'), body);

    return `
${fontFaces()}

body.apntly-modal-container {
  --eden-ink: #171714;
  --eden-muted: #6f6f66;
  --eden-soft: #8a8a80;
  --eden-edge: rgba(23, 23, 20, 0.16);
  --eden-wash: #faf6f4;
  --eden-accent: #ceada7;
  --eden-body: ${body};
  --eden-heading: ${heading};

  font-family: var(--eden-body);
  color: var(--eden-ink);
}

/*
  Apntly's palette is five custom properties, and it declares them on the universal selector -
  every element gets its own copy, so a value set on body alone would never be inherited past
  it. Re-declaring them on body.apntly-modal-container * beats that (0-2-0 against 0-0-0) and
  recolours the app in one go: the booking buttons, the chosen day, the cart chip, the spinner
  and the scrollbar all read var(--primary), so none of them needs a rule of its own below.
*/
body.apntly-modal-container,
body.apntly-modal-container * {
  --primary: var(--eden-ink);
  --secondary: var(--eden-ink);
  --text-black: var(--eden-ink);
  --text-light-black: var(--eden-muted);
  --grey: var(--eden-wash);
}

/* ---------------------------------------------------------------- the card */

body.apntly-modal-container .modal {
  background: rgba(23, 23, 20, 0.52);
}

body.apntly-modal-container .modal-container {
  border: 1px solid var(--eden-edge);
  border-radius: 0;
  box-shadow: none;
  background: #ffffff;
}

body.apntly-modal-container .main-heading {
  font-family: var(--eden-heading);
  font-size: 24px;
  font-weight: 400;
  letter-spacing: 0.01em;
  text-transform: none;
  color: var(--eden-ink);
}

/*
  The close control is a literal capital X in the markup. Hiding the glyph rather than the
  button keeps the hit area and the accessible name, and ::before puts a real multiplication
  sign in its place.
*/
body.apntly-modal-container .close-icon,
body.apntly-modal-container .action-close {
  border-radius: 0;
  background: none;
  border: 0;
  color: var(--eden-soft);
  font-size: 0;
  line-height: 1;
  transition: color 0.2s ease;
}

body.apntly-modal-container .close-icon::before,
body.apntly-modal-container .action-close::before {
  content: '\\2715';
  font-size: 16px;
  font-weight: 400;
}

body.apntly-modal-container .close-icon:hover,
body.apntly-modal-container .action-close:hover {
  color: var(--eden-ink);
}

/* The labels above the two dropdowns carry a style="font-weight: 600" of their own. */
body.apntly-modal-container label {
  font-family: var(--eden-body);
  font-size: 12px;
  font-weight: 500 !important;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--eden-muted);
}

/* ----------------------------------------------------------- the dropdowns */

body.apntly-modal-container .vs__dropdown-toggle {
  border: 1px solid var(--eden-edge);
  border-radius: 0;
  padding: 6px 4px;
  background: #ffffff;
}

body.apntly-modal-container .vs__selected,
body.apntly-modal-container .vs__search {
  font-family: var(--eden-body);
  font-size: 15px;
  color: var(--eden-ink);
}

body.apntly-modal-container .vs__dropdown-menu {
  border: 1px solid var(--eden-edge);
  border-radius: 0;
  box-shadow: none;
}

/* Both of these are !important in the app, and both are a fill where a wash is wanted. */
body.apntly-modal-container .vs__dropdown-option--highlight {
  background-color: var(--eden-wash) !important;
  color: var(--eden-ink);
}

body.apntly-modal-container .vs__selected {
  background-color: transparent;
  border-radius: 0;
}

body.apntly-modal-container .vs__open-indicator,
body.apntly-modal-container .vs__clear {
  fill: var(--eden-soft);
}

/* ------------------------------------------------------------ the calendar */

body.apntly-modal-container .vc-container {
  font-family: var(--eden-body);
  border: 1px solid var(--eden-edge);
  border-radius: 0;
}

body.apntly-modal-container .vc-title {
  font-family: var(--eden-heading);
  font-size: 18px;
  font-weight: 400;
  letter-spacing: 0.01em;
  color: var(--eden-ink);
}

body.apntly-modal-container .vc-weekday {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--eden-muted);
}

body.apntly-modal-container .vc-day-content {
  border-radius: 0;
  font-size: 14px;
  color: var(--eden-ink);
}

body.apntly-modal-container .vc-day-content:hover {
  background-color: var(--eden-wash) !important;
  color: var(--eden-ink) !important;
}

body.apntly-modal-container .vc-day-content.is-disabled {
  color: rgba(23, 23, 20, 0.28);
}

/* The app sets the chosen day with !important, so this has to answer in kind. */
body.apntly-modal-container .vc-highlight {
  background-color: var(--eden-ink) !important;
  border-radius: 0 !important;
  border-color: var(--eden-ink) !important;
}

body.apntly-modal-container .vc-arrow {
  border-radius: 0;
  color: var(--eden-ink);
}

body.apntly-modal-container .vc-arrow:hover {
  background: var(--eden-wash);
}

/* --------------------------------------------------------------- the times */

body.apntly-modal-container .select-time-slot {
  font-family: var(--eden-body);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--eden-muted);
}

/* The app pins this border with !important, so it only moves for another one. */
body.apntly-modal-container .time-slot {
  border: 1px solid var(--eden-edge) !important;
  border-radius: 0;
  background: #ffffff;
  color: var(--eden-ink);
  font-family: var(--eden-body);
  font-size: 14px;
  letter-spacing: 0.02em;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

/*
  Hover and chosen share one rule in the app, both filled with --primary. Now that --primary is
  the theme's ink that is right for the chosen slot and far too loud for a pointer passing over,
  so hover is pulled back to the wash the cards on the page use.
*/
body.apntly-modal-container .time-slot:hover {
  background: var(--eden-wash);
  border-color: var(--eden-ink) !important;
  color: var(--eden-ink);
}

body.apntly-modal-container .time-slot.selected,
body.apntly-modal-container .time-slot.selected:hover {
  background: var(--eden-ink);
  border-color: var(--eden-ink) !important;
  color: #ffffff;
}

body.apntly-modal-container .time-slot.disabled,
body.apntly-modal-container .time-slot.disabled:hover {
  background: #ffffff;
  border-color: rgba(23, 23, 20, 0.08) !important;
  color: rgba(23, 23, 20, 0.28);
}

body.apntly-modal-container .time-slot-not-selected-text,
body.apntly-modal-container .timezone-container {
  font-family: var(--eden-body);
  font-size: 13px;
  color: var(--eden-muted);
}

/* --------------------------------------------------------------- the button */

body.apntly-modal-container .btn,
body.apntly-modal-container .btn-book,
body.apntly-modal-container .btn-back-button {
  border-radius: 0;
  border: 1px solid var(--eden-ink);
  background: var(--eden-ink);
  color: #ffffff;
  font-family: var(--eden-body);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 14px 24px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

body.apntly-modal-container .btn:hover:not([disabled]),
body.apntly-modal-container .btn-book:hover:not([disabled]) {
  background: #ffffff;
  color: var(--eden-ink);
}

body.apntly-modal-container .btn-back-button {
  background: #ffffff;
  color: var(--eden-ink);
}

body.apntly-modal-container .btn-back-button:hover {
  background: var(--eden-wash);
}

body.apntly-modal-container .btn[disabled],
body.apntly-modal-container .btn-book[disabled] {
  background: rgba(23, 23, 20, 0.16);
  border-color: transparent;
  color: #ffffff;
}

/* ----------------------------------------------- the free-booking questions */

body.apntly-modal-container .answer-text {
  border: 1px solid var(--eden-edge);
  border-radius: 0;
  font-family: var(--eden-body);
  font-size: 15px;
  padding: 10px 12px;
  color: var(--eden-ink);
}

body.apntly-modal-container .answer-text:focus {
  border-color: var(--eden-ink);
}

body.apntly-modal-container .question-text,
body.apntly-modal-container .success-message-text {
  font-family: var(--eden-body);
  color: var(--eden-ink);
}

body.apntly-modal-container .apntly-branding-powered-by {
  font-size: 12px;
  color: var(--eden-soft);
  opacity: 0.7;
}

/* --------------------------------------------------------------- the layout */

/*
  Apntly stacks the calendar, the timezone line and the two dropdowns down one narrow column
  and hangs the times off the side, which asks you to pick a date before you have been shown
  what you are booking, and leaves the right-hand column empty under the dropdowns. Rearranged
  into three bands: the calendar on the left with the times scrolling beside it on the right,
  the timezone line beneath the calendar, and one bottom bar carrying both dropdowns on the
  left and the booking button on the right.

  The app's own markup buries those pieces two wrappers deep, so .date-time-picker,
  .desktop-calendar-selector and .side-menu are dissolved with display: contents and their
  children land directly on one grid. 1000px is the app's own desktop breakpoint - below it
  the modal is already a single sensible column, so it is left alone.
*/
@media screen and (min-width: 1000px) {
  body.apntly-modal-container .container {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 248px);
    column-gap: 36px;
    row-gap: 16px;
    align-items: start;
  }

  body.apntly-modal-container .date-time-picker,
  body.apntly-modal-container .desktop-calendar-selector,
  body.apntly-modal-container .side-menu {
    display: contents;
  }

  /* The calendar holds the left column for both of the rows the times run down. */
  body.apntly-modal-container .date-picker {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  /*
    The list of times is taller than the month beside it, which left a band of white between
    the bottom of the calendar's outline and the timezone line. The calendar is stretched to
    the full height of the band instead, and the height handed down through v-calendar's own
    boxes so the week rows open up to fill it rather than the outline growing around a month
    that stays where it was. Nothing here touches the height of the dialog.
  */
  body.apntly-modal-container .date-picker {
    align-self: stretch;
    display: flex;
    flex-direction: column;
  }

  body.apntly-modal-container .date-picker > * {
    flex: 1 1 auto;
    min-height: 0;
  }

  body.apntly-modal-container .date-picker .vc-container,
  body.apntly-modal-container .date-picker .vc-pane-container,
  body.apntly-modal-container .date-picker .vc-pane {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  /*
    v-calendar draws the weeks as a grid in some versions and as rows of grids in others, so
    both are told to take the space: whichever one is there answers, the other is not present.
  */
  /*
    The week rows take what is going, but never more than this: left to stretch freely they
    opened out to a hundred-odd pixels each and the month swallowed the dialog.
  */
  body.apntly-modal-container .date-picker .vc-weeks {
    flex: 1 1 auto;
    align-content: stretch;
    grid-auto-rows: minmax(44px, 56px);
  }

  body.apntly-modal-container .date-picker .vc-week {
    flex: 0 1 auto;
  }

  body.apntly-modal-container .select-time-slot {
    grid-column: 2;
    grid-row: 1;
    margin: 0;
  }

  body.apntly-modal-container .time-slots-container {
    grid-column: 2;
    grid-row: 2;
  }

  body.apntly-modal-container .timezone-container {
    grid-column: 1;
    grid-row: 3;
    margin: 0;
  }

  body.apntly-modal-container .time-slot-not-selected-text {
    grid-column: 2;
    grid-row: 3;
    margin: 0;
  }

  /* --------------------------------------------------------- the bottom bar */

  /*
    The two dropdowns and the booking button sit in three different places in the app's markup
    and there is no wrapper around them to make a flex row of, so the bar is made by landing
    them all on row four and ruling the top of each piece.
  */

  /*
    Both halves of the bar are given the same rule, the same padding above their contents and
    the same minimum height, and both centre what is inside them: that is what puts the two
    dropdowns and the button on one line. Left to themselves they do not line up - the app
    stacked these blocks down a column, so each carries its own bottom margin, and the button
    sits in a cell of its own with nothing to agree with.
  */

  /* The only child of the desktop selector that is not the button or its spacer. */
  body.apntly-modal-container .desktop-calendar-selector > div:first-child {
    grid-column: 1;
    grid-row: 4;
    display: flex;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
    min-height: 72px;
    margin: 0;
    padding-top: 20px;
    border-top: 1px solid var(--eden-edge);
  }

  /*
    The two dropdowns are not direct children of that div - on the page they come out a wrapper
    deeper - so the row is described at both depths: whichever level actually holds them becomes
    the flex row, margins are cleared at both, and the width is put on the v-select itself
    rather than on whatever box it happens to be sitting in.

    The margins are the app's own and are set inline, so they only move for !important, and a
    flex item will not shrink below its content unless min-width says so.
  */
  body.apntly-modal-container .desktop-calendar-selector > div:first-child > div:only-child {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1 1 auto;
    width: 100% !important;
  }

  body.apntly-modal-container .desktop-calendar-selector > div:first-child > *,
  body.apntly-modal-container .desktop-calendar-selector > div:first-child > * > * {
    min-width: 0;
    margin: 0 !important;
    align-self: center !important;
  }

  /*
    Both dropdowns have to be the same height before centring them means anything: the app
    sizes each toggle to its own contents, so the two sat a line apart.
  */
  body.apntly-modal-container .desktop-calendar-selector > div:first-child .vs__dropdown-toggle {
    box-sizing: border-box;
    height: 48px;
    align-items: center;
  }

  body.apntly-modal-container .desktop-calendar-selector > div:first-child .v-select {
    flex: 0 0 216px;
    width: 216px !important;
    margin: 0 !important;
  }

  /*
    Stacked captions would make the bar two storeys tall. Clipped rather than removed, so the
    name each dropdown is announced by survives.
  */
  body.apntly-modal-container .desktop-calendar-selector > div:first-child label {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  body.apntly-modal-container .book-button-container {
    grid-column: 2;
    grid-row: 4;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    box-sizing: border-box;
    min-height: 72px;
    margin: 0;
    padding-top: 20px;
    border-top: 1px solid var(--eden-edge);
  }

  /* A 40px spacer that only made sense while the button sat under the dropdowns. */
  body.apntly-modal-container .btn-book-margin {
    display: none;
  }

  body.apntly-modal-container .btn-book {
    width: 100%;
    margin: 0 !important;
  }

  /* ------------------------------------------------------ the time scroller */

  /*
    One column beside the calendar rather than a grid beneath it: a day with thirty slots now
    scrolls where it stands instead of pushing the bottom bar off the screen. The app's own
    scrollbar is a black slab, so it is drawn down to a hairline here.
  */
  body.apntly-modal-container .time-slots-container {
    display: flex;
    flex-direction: column;
    /*
      The app wraps this container, which down a column and against a capped height means it
      wraps into further COLUMNS - the times ran left to right off the side of the modal. One
      column that scrolls is the whole point of the band, so the wrap is switched off here.
    */
    flex-wrap: nowrap;
    gap: 8px;
    margin-top: 0;
    /*
      The app gives this container a height of its own, so the cap has to be stated firmly or
      the list runs the full length of the day and drags the whole dialog down with it.
    */
    height: auto !important;
    max-height: 316px !important;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 10px;
    scrollbar-width: thin;
    scrollbar-color: rgba(23, 23, 20, 0.28) rgba(23, 23, 20, 0.07);
  }

  body.apntly-modal-container .time-slots-container::-webkit-scrollbar {
    width: 4px;
  }

  body.apntly-modal-container .time-slots-container::-webkit-scrollbar-track {
    background: rgba(23, 23, 20, 0.07);
  }

  body.apntly-modal-container .time-slots-container::-webkit-scrollbar-thumb {
    background: rgba(23, 23, 20, 0.28);
  }

  /* Each slot fills the column: the app sizes them to their text, which leaves a ragged edge. */
  body.apntly-modal-container .time-slot-container {
    width: auto;
    flex: 0 0 auto;
    align-self: stretch;
  }

  /* A range like "03:30 PM - 04:30 PM" is one thing to read, never two lines. */
  body.apntly-modal-container .time-slot {
    width: 100%;
    white-space: nowrap;
  }
}
`;
  };

  /*
    The stylesheet goes in once per iframe document. Vue mounts on #app and leaves <head>
    alone, so nothing re-renders it away; the guard is only against the load event and the
    observer both firing for the same frame.
  */
  const dress = (frame) => {
    const doc = frame.contentDocument;
    if (!doc || !doc.head || doc.head.querySelector(`style[${MARK}]`)) return;
    const style = doc.createElement('style');
    style.setAttribute(MARK, '');
    style.textContent = skin();
    doc.head.appendChild(style);
  };

  const watch = (frame) => {
    dress(frame);
    frame.addEventListener('load', () => dress(frame));
  };

  /*
    The launcher's tooltip is printed into OUR document rather than the iframe, and it stays on
    screen while the modal is open - it sits in the top-left corner of the page, over the
    header. The page never shows Apntly's own floating button (the section triggers the modal
    from its own markup), so the label has nothing left to label.

    It carries no class of its own to go by, so it is found by the one thing that identifies
    it: an Apntly element with no children whose whole text is the launcher's label.
  */
  const LAUNCHER_LABEL = 'Appointment Booking';

  const hideLauncherTooltip = () => {
    for (const el of document.querySelectorAll('[class*="apntly"]')) {
      if (el.children.length === 0 && el.textContent.trim() === LAUNCHER_LABEL) {
        el.style.display = 'none';
      }
    }
  };

  document.querySelectorAll('iframe.apntly-modal').forEach(watch);
  hideLauncherTooltip();

  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('iframe.apntly-modal')) watch(node);
        node.querySelectorAll?.('iframe.apntly-modal').forEach(watch);
      }
    }
    hideLauncherTooltip();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
