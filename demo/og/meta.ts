import { H, W, esc } from "./render";

export interface ShareMeta {
  title: string;
  description: string;
  url: string; // og:url
  canonical: string;
  image: string;
  imageAlt: string;
  imageIsPreview: boolean; // W x H render; false for a fallback icon
}

/** The <title>, description, canonical and OG/Twitter tags for a share page. */
export function shareMetaTags(m: ShareMeta): string {
  const tag = (attr: string, key: string, value: string) => `<meta ${attr}="${key}" content="${esc(value)}" />`;
  return [
    `<title>${esc(m.title)}</title>`,
    tag("name", "description", m.description),
    `<link rel="canonical" href="${esc(m.canonical)}" />`,
    tag("property", "og:type", "website"),
    tag("property", "og:site_name", "iitbmap"),
    tag("property", "og:title", m.title),
    tag("property", "og:description", m.description),
    tag("property", "og:url", m.url),
    tag("property", "og:image", m.image),
    ...(m.imageIsPreview ? [tag("property", "og:image:width", String(W)), tag("property", "og:image:height", String(H))] : []),
    tag("property", "og:image:alt", m.imageAlt),
    tag("name", "twitter:card", m.imageIsPreview ? "summary_large_image" : "summary"),
    tag("name", "twitter:title", m.title),
    tag("name", "twitter:description", m.description),
    tag("name", "twitter:image", m.image),
  ].join("\n  ");
}
