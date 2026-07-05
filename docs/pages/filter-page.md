# Filter / Directory Listing page — Racoon Eye v1

Status: **fully discussed and confirmed** (2026-07-05).

An advanced search/filter interface for discovering and filtering health services across all types in the Racoon Eye directory.

Reached via a dedicated "Filter" or "Directory" link (not yet assigned to a specific nav location — TBD whether it appears in the homepage top bar, footer, or as a separate landing page).

## Service types

The directory is **not limited to hospitals**. It includes:
- Hospitals
- Clinics
- Pharmacies
- Radiology/diagnostic imaging centers
- Other health services (dental, optometry, specialized practices, etc. — exact list TBD)

## Filter interface

- **Service type:** multi-select filter (hospital, clinic, pharmacy, radiology, etc.).
- **Location:** search/filter by location (city, neighborhood, distance from user location if geolocation is available).
- **Speciality/service:** filter by medical speciality, service type, or capability (e.g., "cardiology", "24-hour pharmacy", "X-ray", etc.).
- **Rating:** minimum rating threshold (e.g., show only services rated 4+ stars, if ratings are available across all service types).
- **Availability:** filter by current open/closed status or operating hours (e.g., "open now", "24-hour").
- **Other filters:** TBD as the service taxonomy expands (e.g., "accepts insurance", "telemedicine available", etc.).

## Results display

- **List view:** tabular or card-based listing of matching services.
- **Each result card shows:**
  - Service name and type (hospital, pharmacy, etc.)
  - Address / location
  - Contact info (phone, website)
  - Hours of operation
  - Quick star rating (if available)
  - Link to full profile page (hospital-profile.md, or equivalent for other service types)
- **Map view (optional for v1):** overlay results on the map, similar to the homepage search results (but filtered).

## Design & layout

- Top bar and footer are the standard shared components from [homepage.md](homepage.md).
- All theme rules apply: matte blue/white/amethyst, sans-serif fonts.
- **Suggestion tab:** per first-aid requirements, a suggestion/feedback affordance is present on this page too.

## Open items / not yet decided

- Navigation placement: where does the user access the filter page from? (Homepage link, separate top-nav item, footer link, etc.)
- Service type taxonomy: exact list of service types supported and how they're categorized.
- Speciality/service taxonomy: what are the valid specialities and services users can filter by?
- Rating aggregation: do all service types have ratings (hospitals yes, pharmacies maybe, etc.), or is this filtered out for service types that don't have a rating mechanism yet?
- Map view: should v1 include a map view of results, or is list view sufficient?
- Search-vs-filter: should the filter page also have a text search box, or is it purely filter-based?
