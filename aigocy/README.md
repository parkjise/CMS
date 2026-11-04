# Aigocy Design Study

Independent HTML/SCSS/JS reconstruction of the main page at https://wpriverthemes.com/HTML/aigocy/ . This is not the purchased ThemeForest source package; secondary pages are not included.

## Preview

Use the existing local server with `aigocy/index.html`, or serve `docs/mockups/hospital` and open `/aigocy/`. HTML partials use fetch and therefore require HTTP, not file://.

## Editing

- `index.html`: section order.
- `components/header.html`, `components/footer.html`: shared navigation and branding.
- `components/sections/*.html`: copy, images, cards, pricing, and form fields.
- `assets/styles/_tokens.scss`: colors, fonts, spacing.
- `assets/styles/main/*.scss`: section styles, using existing BEM names and helpers.
- `assets/styles/_mixins.scss`: forwards the existing `templates/assets/styles/_mixins.scss`. Existing templates are never modified.
- `assets/js/main.js`: menu, scroll reveals, project dialog, testimonial controls, billing toggle, and local form feedback.

Compile from the repository root:

```sh
npx sass docs/mockups/hospital/aigocy/assets/styles/template.scss docs/mockups/hospital/aigocy/assets/css/template.css
```

Remix Icon loads from the existing `templates/assets/vendor` folder. Urbanist is stored locally. Section text is editable sample content. Contact submission is a preview only and does not send or store messages. Price amounts and testimonials are samples, not commercial claims.

## Reference Assets

Images under `assets/images` are from the publicly viewable Aigocy demo at `https://wpriverthemes.com/HTML/aigocy/assets/images/`. Used for local visual reference only; no production license is granted by this reconstruction. Replace these assets or obtain the appropriate rights before publishing. Urbanist is from Google Fonts (SIL Open Font License); see `assets/fonts/OFL.txt`.

This reconstruction includes the main page: hero, introduction, partners, services, selected work, process, benefits, features, tools, team, statistics, awards, testimonials, pricing, FAQs, and contact. Navigation targets these sections rather than unavailable original secondary pages.


https://konabizcard.com/