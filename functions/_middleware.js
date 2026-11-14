const LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</.well-known/agent-skills/index.json>; rel="service-desc"',
  '</.well-known/mcp/server-card.json>; rel="describedby"',
  '</.well-known/agent-card.json>; rel="describedby"',
  '</llms.txt>; rel="describedby"'
].join(', ');

function wantsMarkdown(acceptHeader) {
  if (!acceptHeader || !acceptHeader.includes('text/markdown')) return false;
  const parts = acceptHeader.split(',').map(p => p.trim());
  let mdQ = -1;
  let htmlQ = -1;
  for (const part of parts) {
    const [type, ...params] = part.split(';').map(s => s.trim());
    let q = 1.0;
    for (const param of params) {
      if (param.startsWith('q=')) q = parseFloat(param.slice(2)) || q;
    }
    if (type.toLowerCase() === 'text/markdown') mdQ = q;
    if (type.toLowerCase() === 'text/html') htmlQ = q;
  }
  return mdQ >= 0 && (htmlQ < 0 || mdQ >= htmlQ);
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const accept = request.headers.get('accept') || '';

  if ((url.pathname === '/' || url.pathname === '/index.html') && wantsMarkdown(accept)) {
    const llmsUrl = new URL('/llms.txt', request.url);
    const llmsResp = await env.ASSETS.fetch(llmsUrl);
    const mdBody = await llmsResp.text();
    const frontmatter = [
      '---',
      'title: "Damaru — Interactive 3D Hourglass Drum"',
      'description: "Click, drag, or shake a physically simulated 3D Damaru with XPBD cord physics and Bessel-mode WebAudio."',
      `url: "${url.origin}/"`,
      '---',
      ''
    ].join('\n');
    const fullMd = frontmatter + mdBody;
    return new Response(fullMd, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'vary': 'Accept',
        'link': LINK_HEADER,
        'content-signal': 'ai-train=yes, search=yes, ai-input=yes',
        'x-markdown-tokens': String(Math.ceil(fullMd.length / 4))
      }
    });
  }

  const resp = await next();
  const headers = new Headers(resp.headers);
  headers.set('link', LINK_HEADER);
  headers.set('content-signal', 'ai-train=yes, search=yes, ai-input=yes');
  headers.append('vary', 'Accept');
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers
  });
}
