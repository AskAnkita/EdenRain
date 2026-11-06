/*
  Where a saved design lives.

  A configured ring is not a product. It has no variant, no price Shopify will
  accept and nothing in the catalogue to point at - so there is nothing to add
  to a cart, and the studio does not try. What a shopper leaves the studio with
  instead is a saved design: a record of every choice they made, the code that
  reopens the identical 3D ring in the builder, and a short quotable reference
  they can give us on the telephone.

  THE 3D MODEL IS A KEY, NOT A FILE. The builder runs on iJewel's domain inside
  a cross-origin frame and exposes no way to export a .glb - their own
  documentation has no export call on the embedded viewer, and the frame hands
  out nothing we have not asked it for. What it does hand over is its state
  string, which rebuilds the exact scene when it is fed back in as ?state=.
  That string is the design, as far as anything outside the frame is concerned:
  the same stone, the same head, the same metal, the same band, drawn again.
  Everything here treats it as the artefact and carries it unchanged. Whenever
  a real model file becomes available - a self-hosted licensed viewer, or an
  export route from iJewel - it belongs on the record as one more field, and
  nothing else in the flow has to move.

  The store is this browser's. localStorage is the only durable shelf a theme
  has: writing to a customer metafield needs an app, and a cart line needs a
  variant and a price. So a saved design survives a closed tab and a return
  visit on this device, and does not travel to another one. That is the whole
  reason "Contact support" sends the record to us by email rather than relying
  on the shopper still having it - the copy we can act on is the one in our
  inbox, and the copy in here is the shopper's own shelf.

  Everything is wrapped in try/catch and every read can come back empty:
  private browsing, blocked site data and a full quota all throw, and a studio
  that threw on save would lose the ten minutes somebody just spent designing.

  window.edenDesignStore
    .list()                -> [record], newest first
    .save(design, context) -> record, after writing it
    .find(id)              -> record or null
    .remove(id)            -> boolean
    .summary(record)        -> "Shape: Oval, Metal: 18k white gold, ..."
    .fromBridge(data, ctx) -> record, built but not written
*/
(function () {
  if (window.edenDesignStore) return;

  var KEY = 'eden-saved-designs';
  // The newest designs are the ones anybody asks about. A long state string
  // can run to a couple of kilobytes, and the quota is per origin and shared
  // with everything else the theme keeps, so the shelf is deliberately short.
  var KEEP = 20;

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return [];
      var rows = JSON.parse(raw);
      return Array.isArray(rows) ? rows.filter(function (row) { return row && row.id; }) : [];
    } catch (error) {
      return [];
    }
  }

  // A full quota throws on the write, so the oldest designs are dropped and it
  // is tried again rather than reported as a failure: losing the design from
  // three visits ago to keep the one just made is the right trade.
  function write(rows) {
    var attempt = rows.slice(0, KEEP);
    while (attempt.length) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(attempt));
        return true;
      } catch (error) {
        attempt = attempt.slice(0, attempt.length - 1);
      }
    }
    try {
      window.localStorage.removeItem(KEY);
    } catch (error) {
      /* nothing writable here at all - private browsing */
    }
    return false;
  }

  // Short, unambiguous out loud and in an email subject: no O/0 or I/1, and a
  // shape nobody mistakes for an order number. It is a reference, not a secret.
  function reference(prefix) {
    var alphabet = 'ACDEFGHJKLMNPQRTUVWXY2346789';
    var code = '';
    for (var i = 0; i < 6; i++) {
      code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return (prefix || 'ER') + '-' + code;
  }

  // The builder sends its price in minor units with the scale alongside it -
  // 939000 at minorUnits 2 is $9,390.00 - so it is divided here rather than
  // printed raw onto a record somebody reads.
  function money(price) {
    if (!price || typeof price !== 'object') return '';
    var amount = Number(price.amount);
    if (!isFinite(amount)) return '';
    var scale = isFinite(Number(price.minorUnits)) ? Number(price.minorUnits) : 2;
    var value = amount / Math.pow(10, scale);
    var currency = price.currency || 'GBP';
    try {
      return new Intl.NumberFormat(document.documentElement.lang || 'en', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: scale
      }).format(value);
    } catch (error) {
      return currency + ' ' + value.toFixed(scale);
    }
  }

  // The builder's own words, not ours. Labels arrive as
  // { axis, label, option, value } and the shown value is the one that goes on
  // the record - never the slug, which means nothing to whoever reads it.
  function options(design) {
    var rows = [];
    var labels = design.labels;

    if (Array.isArray(labels)) {
      labels.forEach(function (row) {
        if (!row) return;
        var name = row.label || row.axis || row.name || row.key;
        var value = row.value === undefined ? row.option : row.value;
        if (name && value !== undefined && value !== null && value !== '') {
          rows.push({ name: String(name), value: String(value) });
        }
      });
    } else if (labels && typeof labels === 'object') {
      Object.keys(labels).forEach(function (name) {
        var value = labels[name];
        if (value !== undefined && value !== null && value !== '') {
          rows.push({ name: name, value: String(value) });
        }
      });
    }

    // Some builds answer getSelection with a flat { axis: option } map and no
    // labels at all. It is worse reading than the labels, so it is only used
    // when there is nothing better.
    if (!rows.length && design.selection && typeof design.selection === 'object') {
      Object.keys(design.selection).forEach(function (axis) {
        var value = design.selection[axis];
        if (value === undefined || value === null || value === '') return;
        rows.push({ name: axis, value: String(typeof value === 'object' ? value.label || value.option || value.key : value) });
      });
    }

    return rows;
  }

  // The link that rebuilds the ring. Two of them, because they answer different
  // questions: ours reopens the design inside the studio page, which is where a
  // shopper should land, and the builder's own URL is the one that still works
  // if the studio page is ever renamed - which is what whoever is quoting the
  // design in two months will click.
  function reopen(state, context) {
    var links = {};
    if (!state) return links;

    try {
      var studio = new URL(context.studio || window.location.pathname, window.location.origin);
      studio.searchParams.set('state', state);
      links.reopen = studio.toString();
    } catch (error) {
      /* a studio path we cannot parse - the builder link below still stands */
    }

    if (context.embed) {
      links.builder = context.embed + (context.embed.indexOf('?') === -1 ? '?' : '&') + 'state=' + encodeURIComponent(state);
    }

    return links;
  }

  var store = {
    list: read,

    find: function (id) {
      if (!id) return null;
      var rows = read();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === id) return rows[i];
      }
      return null;
    },

    remove: function (id) {
      var rows = read();
      var kept = rows.filter(function (row) { return row.id !== id; });
      if (kept.length === rows.length) return false;
      write(kept);
      return true;
    },

    // Built from whatever the bridge gave us. Nothing is invented: a builder
    // that answers with no labels and no price produces a thin record rather
    // than a wrong one.
    fromBridge: function (design, context) {
      var data = design || {};
      var ctx = context || {};
      var state = typeof data.state === 'string' ? data.state : '';
      var links = reopen(state, ctx);

      return {
        id: reference(ctx.prefix),
        saved: new Date().toISOString(),
        title: data.title ? String(data.title) : '',
        code: data.sku || data.code ? String(data.sku || data.code) : '',
        state: state,
        reopen: links.reopen || '',
        builder: links.builder || '',
        price: money(data.price),
        options: options(data),
        // Kept whole and unread. The bridge is undocumented and its payload
        // grows: anything we have not given a field to is still on the record
        // when somebody comes looking for it.
        raw: { parts: data.parts, specs: data.specs, tags: data.tags }
      };
    },

    save: function (design, context) {
      var record = design && design.id && design.saved ? design : store.fromBridge(design, context);
      var rows = read().filter(function (row) {
        // The same ring saved twice is one design, not two. The state string is
        // the identity: same key, same ring, whatever else has changed.
        return !(record.state && row.state === record.state);
      });
      rows.unshift(record);
      record.stored = write(rows);

      // The single in-flight design, for a page that only wants the last one.
      // This is the key the bespoke enquiry page has always read.
      try {
        window.sessionStorage.setItem('eden-ring-design', JSON.stringify(record));
      } catch (error) {
        /* the query string carries the summary instead */
      }

      return record;
    },

    summary: function (record) {
      if (!record) return '';
      return (record.options || [])
        .map(function (row) { return row.name + ': ' + row.value; })
        .join(', ');
    },

    money: money
  };

  window.edenDesignStore = store;
})();
