/*
 * A ring cannot go into the cart until the customer has picked a ring size themselves.
 *
 * The product form is `novalidate` and posts over fetch, so `required` on the size dropdown was
 * never enforced. Worse, a sized ring always has a variant selected, and that variant carries the
 * first size (3), so Add to Cart quietly ordered a size 3. Changing the metal re-renders the
 * picker with that size shown as if chosen.
 *
 * This keeps the dropdown on "Select Ring Size" until the customer picks one, and stops Add to
 * Cart, the sticky bar and Buy it now with a message until they do. It covers both kinds of ring:
 * a Size option (real variants with their own prices) and the properties[Ring Size] dropdown on
 * rings without one.
 */
(() => {
  if (window.__ringSizeRequired) return;
  window.__ringSizeRequired = true;

  const SIZE_SELECT = '.variant-option--size select';
  const MESSAGE = 'Please choose your ring size.';
  const chosen = new Map(); // product id -> the size the customer picked

  const productOf = (el) => el.closest('variant-selects')?.dataset.productId || '';
  const isProperty = (select) => select.name.startsWith('properties[');
  const sizeSelects = (productId) =>
    [...document.querySelectorAll(SIZE_SELECT)].filter((s) => productOf(s) === productId);

  function placeholderOf(select) {
    let p = select.querySelector('option[value=""]');
    if (!p) {
      p = document.createElement('option');
      p.value = '';
      p.disabled = true;
      p.hidden = true;
      p.textContent = 'Select Ring Size';
      select.prepend(p);
    }
    return p;
  }

  function show(select, option) {
    // variant-selects reads the selected *attribute*, not the property, so both move together.
    select.querySelectorAll('option[selected]').forEach((o) => o.removeAttribute('selected'));
    option.setAttribute('selected', 'selected');
    option.selected = true;
  }

  // Put every size dropdown back on the placeholder unless the customer picked a size, and
  // restore a picked line-item size that a re-render (a metal change) just wiped.
  function sync() {
    document.querySelectorAll(SIZE_SELECT).forEach((select) => {
      const pick = chosen.get(productOf(select));
      if (pick == null) {
        if (select.value !== '') show(select, placeholderOf(select));
      } else if (isProperty(select) && select.value !== pick) {
        const o = [...select.options].find((x) => x.value === pick);
        if (o) show(select, o);
      }
      if (select.value !== '') clearError(select);
    });
  }

  function clearError(select) {
    const box = select.closest('.variant-option--size');
    box?.classList.remove('ring-size--missing');
    box?.querySelector('.ring-size__error')?.remove();
  }

  function flagMissing(select) {
    const box = select.closest('.variant-option--size');
    if (!box) return;
    box.classList.add('ring-size--missing');
    if (!box.querySelector('.ring-size__error')) {
      const p = document.createElement('p');
      p.className = 'ring-size__error';
      p.setAttribute('role', 'alert');
      p.textContent = MESSAGE;
      box.append(p);
    }
  }

  // The size dropdowns for the product this form adds, or none when it is not a ring.
  function missingFor(el) {
    const scope = el.closest('product-info') || el.closest('.shopify-section') || document;
    const productId = scope.querySelector('variant-selects')?.dataset.productId;
    if (!productId) return [];
    const selects = sizeSelects(productId);
    if (!selects.length) return [];
    return chosen.has(productId) && selects.every((s) => s.value !== '') ? [] : selects;
  }

  function block(event, el) {
    const missing = missingFor(el);
    if (!missing.length) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    missing.forEach(flagMissing);
    // Take the customer to the dropdown on the page, not the copy in the sticky bar.
    const target = missing.find((s) => !s.closest('[class*="sticky"]')) || missing[0];
    target.closest('.variant-option--size')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    return true;
  }

  document.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.matches(SIZE_SELECT)) return;
    if (!event.isTrusted || select.value === '') return;
    const productId = productOf(select);
    chosen.set(productId, select.value);
    // Keep the sticky bar's copy of the dropdown in step with the main one.
    sizeSelects(productId).forEach((s) => { if (s !== select && isProperty(s)) s.value = select.value; clearError(s); });
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form instanceof HTMLFormElement && form.closest('product-form-component')) block(event, form);
  }, true);

  // Buy it now goes straight to checkout with the selected variant, never through the form.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.shopify-payment-button, shopify-buy-it-now-button, shopify-accelerated-checkout');
    if (button && button.closest('product-form-component')) block(event, button);
  }, true);

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }).observe(document.documentElement, { childList: true, subtree: true });

  sync();
})();
