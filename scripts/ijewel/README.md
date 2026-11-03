# Guided mobile ring builder

The `guided_mobile` section setting enables a theme-owned mobile interface at widths up to 749px. Desktop keeps the configured remote embed. The bundle uses the same public demo project as the current remote page (`QawzgGE_TcW7tRCtIVVNUg`, instance `dev-e1`), not the merchant's production catalogue.

`upstream-builder.html` is the snapshot retrieved from https://share.ijewel.info/ring-configurator-demo/engagement-ring-builder-cart.html on 2026-11-03. It contains the working component/material adapters, demo pricing, thumbnail assets and pinned iJewel viewer imports. Keep its source separate from the small guided overrides. Rebuild the deployable theme asset with:

```sh
node scripts/ijewel/build-guided.mjs
```

The parent custom element lazily loads `assets/ijewel-guided-document.js`, then puts the document into its own iframe. A document download failure falls back to the configured remote embed. Change the section setting to disable the guided interface.

The steps are Diamond → Setting → Metal → Review. Shape selection must precede setting because it filters the available head variants. Controls and prices come from the upstream adapter; we do not create pretend SDK inputs. Ring size is confirmed through an enquiry because this demo does not expose a ring-size control.

The upstream “Add to Cart” only emits a local JavaScript event and displays success; it has no Shopify cart integration. The guided version hides it and ends in a bespoke enquiry link. Choices are included in the link's `design` query parameter and saved to session storage under `eden-ring-design`; the enquiry destination must read that value to prefill its form. Demo prices are estimates, not a production quote.

Before launch, verify the public project/domain licence, real catalogue, pricing and enquiry destination in the target Shopify preview. No live theme is published by the build script.
