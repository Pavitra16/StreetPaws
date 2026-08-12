# Landing-page hero images

Any .jpg / .jpeg / .png / .webp dropped in this folder joins the hero rotation
automatically — there is no list to update. Vite picks them up with
import.meta.glob, hashes them, and serves them from the CDN edge like any other
build asset. Sorted by filename, so name them 01-…, 02-… to control the order.

## What belongs here

Cheerful, playful, recovered dogs — ideally Indian street dogs (indies) outdoors
in daylight, not groomed studio portraits. This is the first image a visitor
sees next to "Report a dog now", and distress imagery beside a call to action
suppresses the action rather than driving it. The injured dogs appear further
down the page, where there is context for them.

## Size

Resize to about 1200px on the long edge and save at ~80% quality — under 400 KB
each. These are committed to git, and a 3 MB phone photo bloats the repository
permanently, since git keeps every version forever.

## Captions

Optional. Add a line to captions.js next to this file:

    export default {
      '01-kabir.jpg': { name: 'Kabir', note: 'Rescued after a road accident. Now looking for a home.' },
    }

Files with no entry simply show no caption.
