// Collection data. Swap image paths (files live in /public/img) and copy here.
// `price` is optional (e.g. '₹ 85,000'); leave null to show "Price on enquiry".
export const products = [
  {
    id: 'necklace',
    name: 'The Necklace',
    kind: 'Necklace',
    tagline: 'Grace, in every curve.',
    image: '/img/card-necklace.webp',
    alt: 'Gold filigree crescent necklace with a teardrop pendant on brown velvet',
    description: 'A delicate rhythm of ornament. A beautiful beginning to your own story.',
    details: ['Crescent filigree with leaf motifs', 'Beaded edge and teardrop pendant', 'Fine gold chain'],
    price: null,
  },
  {
    id: 'earrings',
    name: 'The Earrings',
    kind: 'Earrings',
    tagline: 'A little light. A lasting glow.',
    image: '/img/card-earrings.webp',
    alt: 'Pair of gold floral jhumka earrings on brown velvet',
    description: 'Graceful movement. Quiet radiance. Details that feel entirely your own.',
    details: ['Floral stud with a long stem', 'Domed jhumka with fine filigree', 'Beaded fringe'],
    price: null,
  },
  {
    id: 'ring',
    name: 'The Ring',
    kind: 'Ring',
    tagline: 'For moments that stay.',
    image: '/img/card-ring.webp',
    alt: 'Gold floral ring with a round stone and engraved leaf band on brown velvet',
    description: 'A small circle of meaning. Discover a piece that belongs to your story.',
    details: ['Flower setting with a round stone', 'Hand-engraved leaf band'],
    price: null,
  },
];
