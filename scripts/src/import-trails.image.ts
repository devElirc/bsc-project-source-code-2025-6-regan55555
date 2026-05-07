import axios from 'axios';

export type LatLon = {
  lat: number;
  lon: number;
};

export type ImageInfo = {
  url: string;
  width: number | null;
  height: number | null;
  source: string;
  title?: string | null;
  description?: string | null;
  categories?: string[];
  mime?: string | null;
  mediatype?: string | null;
  pageUrl?: string | null;
  photographer?: string | null;
  license?: string | null;
} | null;

export type ImageLookupContext = {
  startCoord?: LatLon | null;
  centroidCoord?: LatLon | null;
  location?: string | null;
  region?: string | null;
};

type GeographCandidate = {
  photoId: string | null;
  pageUrl: string | null;
  title: string | null;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  photographer: string | null;
  lat: number | null;
  lon: number | null;
};

type CreateImageResolverOptions = {
  imageCacheFile: string;
  geographApiKey: string;
  enableImageLookup: boolean;
  enableGeographFallback: boolean;
  normalizeSpace: (value: unknown) => string;
  saveJson: (file: string, value: unknown) => void;
  getDistanceMeters: (a: LatLon | null, b: LatLon | null) => number;
};

const BAD_IMAGE_KEYWORDS = [
  'map',
  'locator map',
  'route map',
  'logo',
  'icon',
  'symbol',
  'marker',
  'waymark',
  'waymarker',
  'diagram',
  'schematic',
  'flag',
  'badge',
  'sign',
  'pictogram',
  'gpx',
  'svg',
];

const GOOD_IMAGE_KEYWORDS = [
  'trail',
  'path',
  'footpath',
  'walk',
  'walking',
  'hiking',
  'summit',
  'fell',
  'peak',
  'mountain',
  'moor',
  'woodland',
  'forest',
  'coast',
  'cliff',
  'valley',
  'lake',
  'loch',
  'landscape',
  'viewpoint',
  'countryside',
  'ridge',
];

const TRAIL_TOKEN_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'near',
  'over',
  'under',
  'into',
  'trail',
  'route',
  'walk',
  'walking',
  'hiking',
  'path',
  'way',
  'loop',
  'circuit',
  'stage',
  'north',
  'south',
  'east',
  'west',
  'upper',
  'lower',
  'great',
  'little',
]);

function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXmlEntities(value: string) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function containsAnyKeyword(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function parseXmlAttr(raw: string, attr: string) {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = raw.match(re);
  return match ? decodeXmlEntities(match[1]) : null;
}

function extractXmlTagText(xml: string, tag: string) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(re);
  return match ? decodeXmlEntities(stripHtml(match[1])) : null;
}

function parsePhotoIdFromUrl(url?: string | null) {
  const match = String(url || '').match(/\/photo\/(\d+)/);
  return match ? match[1] : null;
}

function toNumberOrNull(value: string | null | undefined) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function createImageResolver(options: CreateImageResolverOptions) {
  const {
    imageCacheFile,
    geographApiKey,
    enableImageLookup,
    enableGeographFallback,
    normalizeSpace,
    saveJson,
    getDistanceMeters,
  } = options;

  function commonsFileToTitle(value?: string | null) {
    if (!value) return null;
    const raw = normalizeSpace(value);
    if (/^File:/i.test(raw)) return raw.replace(/^File:/i, 'File:');
    const commonsWikiMatch = raw.match(/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/i);
    if (commonsWikiMatch) return decodeURIComponent(commonsWikiMatch[1]);
    return null;
  }

  function commonsUrlToFileTitle(url?: string | null) {
    const raw = normalizeSpace(url);
    if (!raw) return null;
    const wikiMatch = raw.match(/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/i);
    if (wikiMatch) return decodeURIComponent(wikiMatch[1]);

    const uploadMatch = raw.match(
      /upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[^/]+\/[^/]+\/(?:\d+px-)?(.+)$/i
    );
    if (uploadMatch) return `File:${decodeURIComponent(uploadMatch[1])}`;
    return null;
  }

  function upgradeWikimediaThumbToOriginal(url?: string | null) {
    const raw = normalizeSpace(url);
    const match = raw.match(
      /^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/([^/]+\/[^/]+)\/([^/]+)\/\d+px-(.+)$/i
    );
    if (!match) return null;
    return `https://upload.wikimedia.org/wikipedia/commons/${match[1]}/${match[3]}`;
  }

  function parseWikipediaTag(value?: string | null) {
    if (!value) return null;
    const raw = normalizeSpace(value);
    const match = raw.match(/^([a-z-]+):(.*)$/i);
    if (!match) return null;
    return { lang: match[1].toLowerCase(), title: match[2].trim() };
  }

  function parseWikidataTag(value?: string | null) {
    if (!value) return null;
    const raw = normalizeSpace(value);
    return /^Q\d+$/i.test(raw) ? raw.toUpperCase() : null;
  }

  function buildTrailTokens(tags: Record<string, string>, context: ImageLookupContext) {
    const raw = [tags.name, tags.from, tags.to, context.location, context.region]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ');

    return Array.from(
      new Set(
        raw
          .split(/\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 4 && !TRAIL_TOKEN_STOPWORDS.has(s))
      )
    );
  }

  function scoreWikimediaImage(info: NonNullable<ImageInfo>, tags: Record<string, string>) {
    const text = [
      info.title || '',
      info.description || '',
      ...(info.categories || []),
      tags.name || '',
      tags.description || '',
      tags.note || '',
      tags.from || '',
      tags.to || '',
    ]
      .join(' ')
      .toLowerCase();

    if (info.mime === 'image/svg+xml') return -1000;
    if (containsAnyKeyword(text, BAD_IMAGE_KEYWORDS)) return -500;

    let score = 0;
    if (containsAnyKeyword(text, GOOD_IMAGE_KEYWORDS)) score += 120;
    if ((info.width || 0) >= 1200) score += 20;
    if ((info.height || 0) >= 800) score += 20;
    if ((info.width || 0) < 250 || (info.height || 0) < 180) score -= 80;

    if (info.width && info.height) {
      const ratio = info.width / info.height;
      if (ratio > 4 || ratio < 0.25) score -= 60;
    }

    if (/\.jpe?g($|\?)/i.test(info.url)) score += 10;
    if (/\.png($|\?)/i.test(info.url)) score -= 5;
    return score;
  }

  function scoreGeographCandidate(
    candidate: GeographCandidate,
    tags: Record<string, string>,
    context: ImageLookupContext
  ) {
    const title = String(candidate.title || '').toLowerCase();
    if (!candidate.thumbUrl) return -1000;
    if (containsAnyKeyword(title, BAD_IMAGE_KEYWORDS)) return -500;

    let score = 0;
    const tokens = buildTrailTokens(tags, context);
    for (const token of tokens) {
      if (title.includes(token)) score += 22;
    }

    if (containsAnyKeyword(title, GOOD_IMAGE_KEYWORDS)) score += 30;

    const candidateCoord =
      candidate.lat != null && candidate.lon != null
        ? { lat: candidate.lat, lon: candidate.lon }
        : null;

    const startDistance = getDistanceMeters(context.startCoord || null, candidateCoord);
    const centerDistance = getDistanceMeters(context.centroidCoord || null, candidateCoord);
    const bestDistance = Math.min(startDistance, centerDistance);

    if (bestDistance <= 300) score += 60;
    else if (bestDistance <= 800) score += 45;
    else if (bestDistance <= 1500) score += 30;
    else if (bestDistance <= 3000) score += 18;
    else if (bestDistance <= 6000) score += 8;
    else score -= 10;

    if ((candidate.width || 0) >= 640) score += 10;
    if ((candidate.height || 0) >= 480) score += 10;

    if (title.includes('church')) score -= 6;
    if (title.includes('hall')) score -= 6;
    if (title.includes('house')) score -= 6;
    if (title.includes('street')) score -= 8;
    if (title.includes('town centre')) score -= 12;
    if (title.includes('summit')) score += 12;
    if (title.includes('ridge')) score += 8;
    if (title.includes('moor')) score += 8;
    if (title.includes('fell')) score += 10;
    if (title.includes('path')) score += 8;
    if (title.includes('trail')) score += 10;
    return score;
  }

  async function getCommonsImageInfo(
    fileTitle: string,
    imageCache: Record<string, ImageInfo>
  ): Promise<ImageInfo> {
    const normalizedTitle = normalizeSpace(fileTitle);
    const cacheKey = `commons-file-v3:${normalizedTitle.toLowerCase()}`;
    if (Object.prototype.hasOwnProperty.call(imageCache, cacheKey)) return imageCache[cacheKey];

    try {
      const response = await axios.get('https://commons.wikimedia.org/w/api.php', {
        params: {
          action: 'query',
          format: 'json',
          prop: 'imageinfo|categories',
          titles: normalizedTitle,
          iiprop: 'url|dimensions|mime|mediatype|extmetadata',
          cllimit: 50,
          clshow: '!hidden',
          origin: '*',
        },
        headers: {
          'User-Agent': 'trailfinder-collector/ts-monorepo',
          Accept: 'application/json',
        },
        timeout: 20000,
      });

      const pages = response.data?.query?.pages || {};
      const page = Object.values(pages)[0] as any;
      const info = page?.imageinfo?.[0];
      const categories = Array.isArray(page?.categories)
        ? page.categories
            .map((c: any) => String(c?.title || '').replace(/^Category:/i, '').trim())
            .filter(Boolean)
        : [];

      const ext = info?.extmetadata || {};
      const description = stripHtml(ext.ImageDescription?.value || ext.ObjectName?.value || '');
      const result: ImageInfo = info?.url
        ? {
            url: info.url,
            width: info.width || null,
            height: info.height || null,
            source: 'commons',
            title: normalizedTitle,
            description: description || null,
            categories,
            mime: info.mime || null,
            mediatype: info.mediatype || null,
          }
        : null;

      imageCache[cacheKey] = result;
      saveJson(imageCacheFile, imageCache);
      return result;
    } catch (error: any) {
      console.warn('[image] commons lookup failed:', {
        fileTitle: normalizedTitle,
        message: error.message,
      });
      imageCache[cacheKey] = null;
      saveJson(imageCacheFile, imageCache);
      return null;
    }
  }

  async function getWikipediaPageOriginalImage(
    wiki: { lang: string; title: string },
    imageCache: Record<string, ImageInfo>
  ): Promise<ImageInfo> {
    const cacheKey = `wikipedia-pageimage-v3:${wiki.lang}:${wiki.title}`.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(imageCache, cacheKey)) return imageCache[cacheKey];

    try {
      const response = await axios.get(`https://${wiki.lang}.wikipedia.org/w/api.php`, {
        params: {
          action: 'query',
          format: 'json',
          prop: 'pageimages',
          piprop: 'original|name',
          titles: wiki.title,
          origin: '*',
        },
        headers: {
          'User-Agent': 'trailfinder-collector/ts-monorepo',
          Accept: 'application/json',
        },
        timeout: 20000,
      });

      const pages = response.data?.query?.pages || {};
      const page = Object.values(pages)[0] as any;
      let result: ImageInfo = null;

      if (page?.pageimage) {
        result = await getCommonsImageInfo(`File:${page.pageimage}`, imageCache);
      } else if (page?.original?.source) {
        const fileTitle = commonsUrlToFileTitle(page.original.source);
        if (fileTitle) result = await getCommonsImageInfo(fileTitle, imageCache);
      }

      imageCache[cacheKey] = result;
      saveJson(imageCacheFile, imageCache);
      return result;
    } catch (error: any) {
      console.warn('[image] wikipedia page image lookup failed:', {
        wikipedia: `${wiki.lang}:${wiki.title}`,
        message: error.message,
      });
      imageCache[cacheKey] = null;
      saveJson(imageCacheFile, imageCache);
      return null;
    }
  }

  async function getWikidataImageInfo(
    wikidataId: string,
    imageCache: Record<string, ImageInfo>
  ): Promise<ImageInfo> {
    const cacheKey = `wikidata-image-v3:${wikidataId.toLowerCase()}`;
    if (Object.prototype.hasOwnProperty.call(imageCache, cacheKey)) return imageCache[cacheKey];

    try {
      const entityResp = await axios.get('https://www.wikidata.org/w/api.php', {
        params: {
          action: 'wbgetentities',
          ids: wikidataId,
          format: 'json',
          props: 'claims',
          origin: '*',
        },
        headers: {
          'User-Agent': 'trailfinder-collector/ts-monorepo',
          Accept: 'application/json',
        },
        timeout: 20000,
      });

      const entity = entityResp.data?.entities?.[wikidataId];
      const imageClaim = entity?.claims?.P18?.[0];
      const imageName = imageClaim?.mainsnak?.datavalue?.value;

      if (!imageName || typeof imageName !== 'string') {
        imageCache[cacheKey] = null;
        saveJson(imageCacheFile, imageCache);
        return null;
      }

      const result = await getCommonsImageInfo(`File:${imageName}`, imageCache);
      imageCache[cacheKey] = result || null;
      saveJson(imageCacheFile, imageCache);
      return result || null;
    } catch (error: any) {
      console.warn('[image] wikidata image lookup failed:', {
        wikidataId,
        message: error.message,
      });
      imageCache[cacheKey] = null;
      saveJson(imageCacheFile, imageCache);
      return null;
    }
  }

  function extractGeographCandidatesFromXml(xml: string): GeographCandidate[] {
    const blocks = xml.match(/<image\b[\s\S]*?<\/image>/gi) || [];
    const results: GeographCandidate[] = [];

    for (const block of blocks) {
      const imageOpenMatch = block.match(/<image\b([^>]*)>/i);
      const imageAttrs = imageOpenMatch?.[1] || '';
      const userMatch = block.match(/<user\b[^>]*>([\s\S]*?)<\/user>/i);
      const imgMatch = block.match(/<img\b([^>]*)\/?>/i);
      const locationMatch = block.match(/<location\b([^>]*)\/?>/i);

      const pageUrl = parseXmlAttr(imageAttrs, 'url');
      const photoId = parsePhotoIdFromUrl(pageUrl);
      const title = extractXmlTagText(block, 'title');
      const thumbUrl = parseXmlAttr(imgMatch?.[1] || '', 'src');
      const width = toNumberOrNull(parseXmlAttr(imgMatch?.[1] || '', 'width'));
      const height = toNumberOrNull(parseXmlAttr(imgMatch?.[1] || '', 'height'));
      const lat = toNumberOrNull(parseXmlAttr(locationMatch?.[1] || '', 'lat'));
      const lon = toNumberOrNull(parseXmlAttr(locationMatch?.[1] || '', 'long'));
      const photographer = userMatch ? decodeXmlEntities(stripHtml(userMatch[1])) : null;

      results.push({
        photoId,
        pageUrl,
        title,
        thumbUrl,
        width,
        height,
        photographer,
        lat,
        lon,
      });
    }

    return results;
  }

  async function searchGeographNearby(coord: LatLon, distanceKm: number): Promise<GeographCandidate[]> {
    if (!geographApiKey) return [];
    const safeDistance = Math.min(Math.max(Math.round(distanceKm), 1), 10);
    const url = `https://api.geograph.org.uk/api/latlong/${safeDistance}km/${coord.lat},${coord.lon}/${encodeURIComponent(
      geographApiKey
    )}`;

    try {
      const response = await axios.get(url, {
        responseType: 'text',
        headers: {
          'User-Agent': 'trailfinder-collector/ts-monorepo',
          Accept: 'application/xml,text/xml,*/*',
        },
        timeout: 25000,
      });
      return extractGeographCandidatesFromXml(String(response.data || ''));
    } catch (error: any) {
      console.warn('[image] geograph nearby lookup failed:', {
        lat: coord.lat,
        lon: coord.lon,
        distanceKm: safeDistance,
        message: error.message,
      });
      return [];
    }
  }

  async function getGeographPhotoDetails(
    photoId: string,
    imageCache: Record<string, ImageInfo>
  ): Promise<ImageInfo> {
    const cacheKey = `geograph-photo-v2:${photoId}`;
    if (Object.prototype.hasOwnProperty.call(imageCache, cacheKey)) return imageCache[cacheKey];
    if (!geographApiKey) return null;

    const url = `https://api.geograph.org.uk/api/photo/${photoId}/${encodeURIComponent(geographApiKey)}`;

    try {
      const response = await axios.get(url, {
        responseType: 'text',
        headers: {
          'User-Agent': 'trailfinder-collector/ts-monorepo',
          Accept: 'application/xml,text/xml,*/*',
        },
        timeout: 20000,
      });

      const xml = String(response.data || '');
      const imgMatch = xml.match(/<img\b([^>]*)\/?>/i);
      const imgAttrs = imgMatch?.[1] || '';
      const title = extractXmlTagText(xml, 'title');
      const userMatch = xml.match(/<user\b[^>]*>([\s\S]*?)<\/user>/i);
      const photographer = userMatch ? decodeXmlEntities(stripHtml(userMatch[1])) : null;
      const fullUrl = parseXmlAttr(imgAttrs, 'src');
      const width = toNumberOrNull(parseXmlAttr(imgAttrs, 'width'));
      const height = toNumberOrNull(parseXmlAttr(imgAttrs, 'height'));

      const result: ImageInfo = fullUrl
        ? {
            url: fullUrl,
            width,
            height,
            source: 'geograph',
            title: title || null,
            photographer,
            pageUrl: `https://www.geograph.org.uk/photo/${photoId}`,
            license: 'CC licensed via Geograph; display attribution',
          }
        : null;

      imageCache[cacheKey] = result;
      saveJson(imageCacheFile, imageCache);
      return result;
    } catch (error: any) {
      console.warn('[image] geograph photo details failed:', {
        photoId,
        message: error.message,
      });
      imageCache[cacheKey] = null;
      saveJson(imageCacheFile, imageCache);
      return null;
    }
  }

  async function resolveWikimediaImage(
    tags: Record<string, string>,
    imageCache: Record<string, ImageInfo>
  ): Promise<ImageInfo> {
    const candidates: NonNullable<ImageInfo>[] = [];
    const seenUrls = new Set<string>();

    async function pushCandidate(promise: Promise<ImageInfo>) {
      const info = await promise;
      if (!info?.url) return;
      if (seenUrls.has(info.url)) return;
      seenUrls.add(info.url);
      candidates.push(info);
    }

    const directCandidates = [tags.image, tags['image:0']]
      .filter(Boolean)
      .map((v) => normalizeSpace(v));

    for (const value of directCandidates) {
      const commonsTitle = commonsFileToTitle(value) || commonsUrlToFileTitle(value);
      if (commonsTitle) {
        await pushCandidate(getCommonsImageInfo(commonsTitle, imageCache));
        continue;
      }

      const upgradedThumb = upgradeWikimediaThumbToOriginal(value);
      if (upgradedThumb) {
        const title = commonsUrlToFileTitle(upgradedThumb);
        if (title) await pushCandidate(getCommonsImageInfo(title, imageCache));
      }
    }

    const commonsTitle = commonsFileToTitle(tags.wikimedia_commons);
    if (commonsTitle) await pushCandidate(getCommonsImageInfo(commonsTitle, imageCache));

    const wiki = parseWikipediaTag(tags.wikipedia);
    if (wiki) await pushCandidate(getWikipediaPageOriginalImage(wiki, imageCache));

    const wikidataId = parseWikidataTag(tags.wikidata);
    if (wikidataId) await pushCandidate(getWikidataImageInfo(wikidataId, imageCache));

    const ranked = candidates
      .map((info) => ({ info, score: scoreWikimediaImage(info, tags) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.info || null;
  }

  async function resolveGeographImage(
    tags: Record<string, string>,
    imageCache: Record<string, ImageInfo>,
    context: ImageLookupContext
  ): Promise<ImageInfo> {
    if (!enableGeographFallback || !geographApiKey) return null;
    const searchCoords = [context.startCoord, context.centroidCoord].filter(Boolean) as LatLon[];
    if (!searchCoords.length) return null;

    const collected: GeographCandidate[] = [];
    const seen = new Set<string>();

    for (const coord of searchCoords) {
      for (const distanceKm of [2, 5, 10]) {
        const batch = await searchGeographNearby(coord, distanceKm);
        for (const candidate of batch) {
          const key = candidate.photoId || candidate.pageUrl || candidate.thumbUrl || '';
          if (!key || seen.has(key)) continue;
          seen.add(key);
          collected.push(candidate);
        }
        if (collected.length >= 15) break;
      }
      if (collected.length >= 15) break;
    }

    const ranked = collected
      .map((candidate) => ({
        candidate,
        score: scoreGeographCandidate(candidate, tags, context),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.candidate;
    if (!best) return null;

    if (best.photoId) {
      const full = await getGeographPhotoDetails(best.photoId, imageCache);
      if (full?.url) return full;
    }

    if (!best.thumbUrl) return null;
    return {
      url: best.thumbUrl,
      width: best.width,
      height: best.height,
      source: 'geograph-thumb',
      title: best.title,
      photographer: best.photographer,
      pageUrl: best.pageUrl,
      license: 'CC licensed via Geograph; display attribution',
    };
  }

  return async function resolveBestImage(
    tags: Record<string, string>,
    imageCache: Record<string, ImageInfo>,
    context: ImageLookupContext = {}
  ): Promise<ImageInfo> {
    if (!enableImageLookup) return null;

    const wikimediaImage = await resolveWikimediaImage(tags, imageCache);
    if (wikimediaImage?.url) return wikimediaImage;

    const geographImage = await resolveGeographImage(tags, imageCache, context);
    if (geographImage?.url) return geographImage;

    return null;
  };
}
