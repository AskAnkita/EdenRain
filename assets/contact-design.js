/*
  Contact page - the saved ring, carried onto the shop's own enquiry form.

  The studio does not add anything to a cart: a configured ring has no variant
  and no price Shopify will accept. What a shopper leaves the studio with is a
  saved design and a reference, and "Contact us for price" - the line standing
  where iJewel prints its own figure - is how they ask about it. That line is a
  link to this page, taken over by assets/ijewel-design.js so the design is
  written to the store and put on the URL first:

      /pages/contact?design=<reference>&summary=<the choices>&state=<scene key>

  This file is what meets it here. Without those parameters it does nothing at
  all, so the contact page is exactly as it was for everybody else.

  With them, three things happen, in this order:

    1. The design is found. ?design=<reference> against the records
       assets/eden-design-store.js keeps in this browser, which is the full
       record - every option as the builder named it, the price it showed, the
       key that rebuilds the scene. A link opened on another device has no such
       record, so ?summary= and ?state= are read instead: less, but enough to
       quote from and enough to rebuild the ring.

    2. It is shown, above the form, so the shopper can see what they are about
       to send and that we know which ring they mean.

    3. It is attached to the form. Shopify's contact form mails every
       contact[...] field it is given, so each option goes on as its own
       labelled field and the message box is prefilled with the same thing in
       prose. The copy you quote from is the one in the inbox - the record in
       the shopper's browser is not something we can read later.

  The reopen link travels rather than the raw scene key: the key is a couple of
  kilobytes of base64 and no use to a person, while the link rebuilds the exact
  ring in one click two months from now.

  Loaded by layout/theme.liquid on the contact page only. Looks come from
  assets/contact-design.css. Square corners - this theme sets every radius to 0.
*/
(function () {
  'use strict';

  function params() {
    try {
      return new URL(window.location.href).searchParams;
    } catch (error) {
      return null;
    }
  }

  // The record, best first: the full one this browser saved, then whatever the
  // URL carries on its own. A forwarded link, another device and a browser that
  // keeps nothing all land on the second.
  function design(query) {
    var reference = query.get('design') || '';
    var summary = query.get('summary') || '';
    var state = query.get('state') || '';

    if (reference && window.edenDesignStore) {
      var row = window.edenDesignStore.find(reference);
      if (row) return row;
    }

    if (!summary && !state && !reference) return null;

    // "Shape: Round, Carat: 1.00 ct" - written by the store's own summary(),
    // so it is read back the same way round.
    var options = summary
      ? summary.split(',').map(function (part) {
          var at = part.indexOf(':');
          if (at === -1) return { name: '', value: part.trim() };
          return { name: part.slice(0, at).trim(), value: part.slice(at + 1).trim() };
        }).filter(function (option) { return option.name && option.value; })
      : [];

    return { id: reference, options: options, state: state, partial: true };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // The shop's contact form, not a search box or a newsletter sign-up: the one
  // posting form_type=contact.
  function form() {
    var marks = document.querySelectorAll('input[name="form_type"][value="contact"]');
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].form) return marks[i].form;
    }
    return null;
  }

  function hidden(target, name, value) {
    if (!name || value === undefined || value === null || value === '') return;
    var field = el('input');
    field.type = 'hidden';
    field.name = 'contact[' + name + ']';
    field.value = String(value);
    target.appendChild(field);
  }

  function reopenLink(row) {
    if (row.reopen || row.builder) return row.reopen || row.builder;
    // A link opened somewhere with no record still carries the scene key, and
    // the studio takes ?state= straight off its own URL.
    if (row.state) {
      try {
        var studio = new URL('/pages/design-studio-builder', window.location.origin);
        studio.searchParams.set('state', row.state);
        return studio.toString();
      } catch (error) {
        /* nothing we can build - the enquiry still carries the choices */
      }
    }
    return '';
  }

  function run() {
    var query = params();
    if (!query) return;
    if (!query.get('design') && !query.get('summary') && !query.get('state')) return;

    var row = design(query);
    if (!row) return;

    var target = form();
    if (!target) return;

    var options = (row.options || []).filter(function (option) {
      return option && option.name && option.value !== undefined && option.value !== null && option.value !== '';
    });

    /* ------------------------------------------------- what is being sent */

    var card = el('div', 'contact-design');
    card.setAttribute('data-contact-design', '');

    card.appendChild(el('p', 'contact-design__eyebrow', 'Your design'));
    if (row.id) card.appendChild(el('p', 'contact-design__reference', 'Reference ' + row.id));

    if (options.length) {
      var list = el('dl', 'contact-design__specs');
      options.forEach(function (option) {
        list.appendChild(el('dt', 'contact-design__name', option.name));
        list.appendChild(el('dd', 'contact-design__value', String(option.value)));
      });
      card.appendChild(list);
    }

    // The builder's own figure is NOT drawn. It is an estimate off a rate card
    // that is not ours, which is the whole reason the studio covers it in the
    // frame - and somebody who just pressed "Contact us for price" being shown
    // that number on the next page would make a liar of the line they pressed.
    // It still travels to us as a hidden field below, labelled as an estimate,
    // because whoever quotes the ring wants to know what the shopper was shown.

    var href = reopenLink(row);
    if (href) {
      var open = el('a', 'contact-design__reopen eden-link', 'Reopen this design in the studio');
      open.setAttribute('href', href);
      card.appendChild(open);
    }

    if (row.partial && !options.length) {
      card.appendChild(el('p', 'contact-design__note', 'We could not read the full design on this device, so tell us anything you remember below and we will match it to the one you saved.'));
    }

    target.parentNode.insertBefore(card, target);

    /* ------------------------------------------------- what reaches the inbox */

    var pocket = el('div', 'contact-design__fields');
    pocket.hidden = true;

    if (row.id) hidden(pocket, 'Design reference', row.id);
    if (row.title) hidden(pocket, 'Design', row.title);
    options.forEach(function (option) {
      hidden(pocket, option.name, option.value);
    });
    if (row.code) hidden(pocket, 'Code', row.code);
    if (row.price) hidden(pocket, 'Builder estimate', row.price);
    if (href) hidden(pocket, 'Reopen this design', href);

    target.appendChild(pocket);

    /* ------------------------------------------------- the message itself */

    // Prefilled rather than imposed: it is the shopper's message, and they can
    // rewrite every word of it. Only an empty box is written into, so a reload
    // or a failed submit never throws away what they typed.
    var body = target.querySelector('textarea[name="contact[body]"]');
    if (body && !body.value.trim()) {
      var lines = ['I would like a price for the design I saved in the studio.'];
      if (row.id) lines.push('', 'Reference: ' + row.id);
      if (options.length) {
        lines.push('');
        options.forEach(function (option) {
          lines.push(option.name + ': ' + option.value);
        });
      }
      body.value = lines.join('\n');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
