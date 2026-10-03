// =============================================
// EMAIL BLOCKS - turns a list of content blocks into email-safe HTML.
// Shared by the Sequences editor (browser preview) and the Netlify
// send functions (require('../../public/js/email-blocks.js')), so what you
// preview is exactly what gets sent.
//
// Email HTML rules followed here: table layout, inline styles only,
// 600px max width, absolute image URLs, no scripts.
// =============================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EmailBlocks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const WIDTH = 600;
  const PAD = 32;

  // Block catalog — used by the editor to build forms and defaults
  const BLOCK_TYPES = {
    heading:    { label: 'Heading',        icon: 'H',  defaults: { text: 'Your heading here', size: 'lg', align: 'left' } },
    text:       { label: 'Text',           icon: '¶',  defaults: { text: 'Hi {{first_name}},\n\nWrite your message here. Use **bold**, *italic*, and [links](https://homesteadcabinetdesign.com).', align: 'left' } },
    image:      { label: 'Photo',          icon: '🖼', defaults: { url: '', alt: '', link: '', caption: '', width: 'full' } },
    two_images: { label: 'Before / After', icon: '◫',  defaults: { left_url: '', left_caption: 'Before', right_url: '', right_caption: 'After' } },
    button:     { label: 'Button',         icon: '▭',  defaults: { label: 'View your quote', url: '{{quote_link}}', color: '', align: 'center' } },
    quote:      { label: 'Testimonial',    icon: '“',  defaults: { text: 'Homestead did an amazing job on our kitchen.', author: 'Happy customer, Wilbraham' } },
    divider:    { label: 'Divider',        icon: '—',  defaults: {} },
    spacer:     { label: 'Spacer',         icon: '↕',  defaults: { height: 24 } }
  };

  // Merge fields available in subject lines and blocks
  const MERGE_FIELDS = [
    ['first_name', "Customer's first name"],
    ['customer_name', "Customer's full name"],
    ['deal_name', 'Deal / job name'],
    ['quote_number', 'Quote number'],
    ['quote_title', 'Quote title'],
    ['quote_total', 'Quote total'],
    ['quote_link', 'Link to view the quote'],
    ['portal_link', 'Customer portal link'],
    ['company_name', 'Your company name'],
    ['company_phone', 'Your phone number'],
    ['company_website', 'Your website']
  ];

  const SAMPLE_VARS = {
    first_name: 'Sarah',
    customer_name: 'Sarah Thompson',
    deal_name: 'Kitchen Reface – Thompson',
    quote_number: 'Q-1042',
    quote_title: 'Kitchen Cabinet Refacing',
    quote_total: '$18,450.00',
    quote_link: 'https://hcdbooks.netlify.app/portal/quote.html?token=sample',
    portal_link: 'https://hcdbooks.netlify.app/portal/login.html',
    company_name: 'Homestead Cabinet Design',
    company_phone: '(413) 685-5743',
    company_website: 'https://homesteadcabinetdesign.com'
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Replace {{field}} with values. escapeValues=true for HTML contexts.
  function merge(str, vars, escapeValues) {
    return String(str == null ? '' : str).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key) => {
      const v = vars && vars[key.toLowerCase()];
      if (v == null || v === '') return '';
      return escapeValues ? esc(v) : String(v);
    });
  }

  // Only allow safe link schemes
  function safeUrl(raw, vars) {
    const url = merge(raw, vars, false).trim();
    if (!url) return '';
    if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
    if (/^www\./i.test(url)) return 'https://' + url;
    return '';
  }

  // Escaped text -> merge -> light markdown (**bold**, *italic*, [text](url), line breaks)
  function richText(raw, vars, linkColor) {
    let s = esc(raw);
    s = merge(s, vars, true);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      const url = safeUrl(href.replace(/&amp;/g, '&'), vars);
      if (!url) return label;
      return `<a href="${esc(url)}" style="color:${linkColor};text-decoration:underline;">${label}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return s;
  }

  function paragraphs(raw, vars, linkColor, align, color) {
    return String(raw || '').split(/\n\s*\n/).filter(p => p.trim()).map(p =>
      `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${color};text-align:${align};">${richText(p, vars, linkColor).replace(/\n/g, '<br>')}</p>`
    ).join('');
  }

  function row(inner, padX, padY) {
    const px = padX == null ? PAD : padX;
    const py = padY == null ? 0 : padY;
    return `<tr><td style="padding:${py}px ${px}px;">${inner}</td></tr>`;
  }

  function img(url, alt, width) {
    return `<img src="${esc(url)}" alt="${esc(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;">`;
  }

  function placeholder(label, height) {
    return `<div style="background:#eef0ea;border:2px dashed #c5cbbd;color:#7a8270;font-family:${FONT};font-size:14px;text-align:center;padding:${Math.round(height / 2) - 10}px 10px;">${esc(label)}</div>`;
  }

  function renderBlock(b, ctx) {
    const brand = ctx.brand.color;
    const text = ctx.style === 'plain' ? '#222222' : '#333333';
    const vars = ctx.vars;
    const align = ['left', 'center', 'right'].includes(b.align) ? b.align : 'left';

    switch (b.type) {
      case 'heading': {
        const size = b.size === 'md' ? 20 : 26;
        return row(`<h2 style="margin:0 0 12px 0;font-family:${FONT};font-size:${size}px;line-height:1.3;font-weight:700;color:${ctx.style === 'plain' ? text : '#1f2a14'};text-align:${align};">${richText(b.text, vars, brand)}</h2>`, null, 4);
      }
      case 'text':
        return row(paragraphs(b.text, vars, brand, align, text), null, 0);

      case 'image': {
        const full = b.width === 'full' && ctx.style !== 'plain';
        const w = full ? WIDTH : WIDTH - PAD * 2;
        const url = safeUrl(b.url, vars);
        let inner = url ? img(url, b.alt || '', w) : (ctx.preview ? placeholder('Add a photo', 200) : '');
        if (!inner) return '';
        const link = safeUrl(b.link, vars);
        if (link && url) inner = `<a href="${esc(link)}" target="_blank">${inner}</a>`;
        if (b.caption) inner += `<p style="margin:8px 0 0 0;font-family:${FONT};font-size:13px;color:#777777;text-align:center;${full ? `padding:0 ${PAD}px;` : ''}">${richText(b.caption, vars, brand)}</p>`;
        return row(inner, full ? 0 : PAD, 8);
      }

      case 'two_images': {
        const w = Math.floor((WIDTH - PAD * 2 - 12) / 2);
        const cell = (u, cap) => {
          const url = safeUrl(u, vars);
          const pic = url ? img(url, cap || '', w) : (ctx.preview ? placeholder('Add a photo', 140) : '');
          const c = cap ? `<p style="margin:6px 0 0 0;font-family:${FONT};font-size:13px;font-weight:600;color:#555555;text-align:center;">${richText(cap, vars, brand)}</p>` : '';
          return `<td class="eb-col" width="${w}" valign="top" style="width:${w}px;vertical-align:top;">${pic}${c}</td>`;
        };
        return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell(b.left_url, b.left_caption)}<td class="eb-gap" width="12" style="width:12px;font-size:0;">&nbsp;</td>${cell(b.right_url, b.right_caption)}</tr></table>`, null, 8);
      }

      case 'button': {
        const url = safeUrl(b.url, vars) || (ctx.preview ? '#' : '');
        if (!url) return '';
        const color = /^#[0-9a-f]{3,8}$/i.test(b.color || '') ? b.color : brand;
        const label = esc(merge(b.label || 'Learn more', vars, false));
        return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:8px ${align === 'center' ? 'auto' : '0'} 16px;"><tr><td style="border-radius:8px;background:${color};"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a></td></tr></table>`, null, 0);
      }

      case 'quote':
        return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px;"><tr><td style="border-left:4px solid ${brand};background:#f6f8f3;padding:16px 20px;"><p style="margin:0;font-family:Georgia, 'Times New Roman', serif;font-size:17px;line-height:1.5;font-style:italic;color:#333333;">“${richText(b.text, vars, brand)}”</p>${b.author ? `<p style="margin:8px 0 0 0;font-family:${FONT};font-size:13px;color:#666666;">— ${richText(b.author, vars, brand)}</p>` : ''}</td></tr></table>`, null, 0);

      case 'divider':
        return row(`<div style="border-top:1px solid #e3e5df;height:1px;line-height:1px;font-size:0;margin:12px 0;">&nbsp;</div>`, null, 0);

      case 'spacer': {
        const h = Math.max(4, Math.min(120, parseInt(b.height, 10) || 24));
        return `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr>`;
      }
      default:
        return '';
    }
  }

  /**
   * email: { subject, preheader, style: 'branded'|'plain', blocks: [] }
   * ctx:   { vars, brand: {color,name,tagline,logo_url,address,phone,website}, unsubscribeUrl, preview }
   * returns { subject, html, text }
   */
  function renderEmail(email, ctx) {
    ctx = Object.assign({ vars: {}, brand: {}, unsubscribeUrl: '', preview: false }, ctx || {});
    ctx.brand = Object.assign({ color: '#38571a', name: 'Homestead Cabinet Design' }, ctx.brand);
    if (!/^#[0-9a-f]{3,8}$/i.test(ctx.brand.color)) ctx.brand.color = '#38571a';
    ctx.style = email.style === 'plain' ? 'plain' : 'branded';
    const brand = ctx.brand;
    const vars = ctx.vars;

    const subject = merge(email.subject || '', vars, false).trim();
    const preheader = merge(email.preheader || '', vars, false).trim();
    const body = (email.blocks || []).map(b => renderBlock(b, ctx)).join('');

    const unsub = ctx.unsubscribeUrl
      ? `<a href="${esc(ctx.unsubscribeUrl)}" style="color:#888888;text-decoration:underline;">Unsubscribe</a>`
      : (ctx.preview ? '<a href="#" style="color:#888888;text-decoration:underline;">Unsubscribe</a>' : '');
    const addressLine = [brand.address, brand.phone].filter(Boolean).map(esc).join(' · ');

    let inner;
    if (ctx.style === 'plain') {
      inner = `
<table role="presentation" class="eb-wrap" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;background:#ffffff;">
  <tr><td style="height:24px;font-size:0;">&nbsp;</td></tr>
  ${body}
  <tr><td style="padding:24px ${PAD}px 32px;font-family:${FONT};font-size:12px;line-height:1.5;color:#999999;">${esc(brand.name)}${addressLine ? ' · ' + addressLine : ''}${unsub ? '<br>' + unsub : ''}</td></tr>
</table>`;
    } else {
      const logoUrl = safeUrl(brand.logo_url || '', vars);
      const header = logoUrl
        ? `<img src="${esc(logoUrl)}" alt="${esc(brand.name)}" height="48" style="display:block;margin:0 auto;height:48px;width:auto;border:0;">`
        : `<span style="font-family:${FONT};font-size:22px;font-weight:700;color:#ffffff;">${esc(brand.name)}</span>`;
      const tagline = brand.tagline ? `<div style="font-family:${FONT};font-size:13px;color:#dfe8d4;margin-top:4px;">${esc(brand.tagline)}</div>` : '';
      const site = safeUrl(brand.website || '', vars);
      inner = `
<table role="presentation" class="eb-wrap" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;">
  <tr><td align="center" style="background:${brand.color};padding:28px ${PAD}px;border-radius:12px 12px 0 0;">${header}${tagline}</td></tr>
  <tr><td style="background:#ffffff;padding:24px 0 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
  </td></tr>
  <tr><td style="background:#ffffff;border-top:1px solid #eeeeee;border-radius:0 0 12px 12px;padding:20px ${PAD}px;text-align:center;font-family:${FONT};font-size:12px;line-height:1.6;color:#888888;">
    <strong style="color:#555555;">${esc(brand.name)}</strong><br>
    ${addressLine ? addressLine + '<br>' : ''}
    ${site ? `<a href="${esc(site)}" style="color:${brand.color};text-decoration:none;">${esc(site.replace(/^https?:\/\//, ''))}</a><br>` : ''}
    ${unsub}
  </td></tr>
</table>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(subject)}</title>
<style>
  body { margin:0; padding:0; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .eb-wrap { width:100% !important; }
    .eb-col { display:block !important; width:100% !important; padding-bottom:12px; }
    .eb-gap { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${ctx.style === 'plain' ? '#ffffff' : '#f2f3ef'};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${esc(preheader)}${'&#8204;&nbsp;'.repeat(preheader ? 40 : 0)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${ctx.style === 'plain' ? '#ffffff' : '#f2f3ef'};">
  <tr><td align="center" style="padding:${ctx.style === 'plain' ? '0' : '24px 12px'};">${inner}</td></tr>
</table>
</body>
</html>`;

    return { subject, html, text: renderText(email, ctx) };
  }

  // Plain-text alternative (improves deliverability)
  function renderText(email, ctx) {
    const vars = ctx.vars || {};
    const strip = s => merge(s, vars, false)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, l, u) => `${l} (${merge(u, vars, false)})`)
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
    const out = [];
    (email.blocks || []).forEach(b => {
      if (b.type === 'heading') out.push(strip(b.text).toUpperCase());
      else if (b.type === 'text') out.push(strip(b.text));
      else if (b.type === 'button') { const u = safeUrl(b.url, vars); if (u) out.push(`${strip(b.label)}: ${u}`); }
      else if (b.type === 'quote') out.push(`"${strip(b.text)}"${b.author ? ' — ' + strip(b.author) : ''}`);
      else if (b.type === 'image' && b.caption) out.push(strip(b.caption));
    });
    const brand = ctx.brand || {};
    out.push('--\n' + [brand.name, brand.address, brand.phone].filter(Boolean).join('\n'));
    if (ctx.unsubscribeUrl) out.push('Unsubscribe: ' + ctx.unsubscribeUrl);
    return out.join('\n\n');
  }

  function formatPhone(p) {
    const d = String(p || '').replace(/\D/g, '');
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p || '');
  }
  function formatMoney(n) {
    return n == null || isNaN(Number(n)) ? '' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  // settings.company + settings.branding -> brand object for renderEmail
  function brandFromSettings(company, branding) {
    company = company || {};
    branding = branding || {};
    const cityLine = company.city ? `${company.city}, ${company.state || ''} ${company.zip || ''}`.trim() : '';
    return {
      name: company.name || 'Homestead Cabinet Design',
      color: branding.color || '#38571a',
      tagline: branding.tagline || '',
      logo_url: branding.logo_url || '',
      address: [company.address, cityLine].filter(Boolean).join(', '),
      phone: formatPhone(company.phone),
      website: company.website || ''
    };
  }

  // Merge-field values for one deal ({ name, customer: {...}, quote: {...} })
  function buildVars(deal, brand, siteUrl) {
    deal = deal || {};
    brand = brand || {};
    const base = String(siteUrl || 'https://hcdbooks.netlify.app').replace(/\/+$/, '');
    const customer = deal.customer || {};
    const quote = deal.quote || null;
    const fullName = customer.name || [customer.first_name, customer.last_name].filter(Boolean).join(' ');
    const firstName = customer.first_name || (fullName || '').split(' ')[0] || 'there';
    let quoteTotal = '';
    if (quote && quote.total) quoteTotal = formatMoney(quote.total);
    else if (quote && quote.total_low && quote.total_high) quoteTotal = `${formatMoney(quote.total_low)} – ${formatMoney(quote.total_high)}`;
    return {
      first_name: firstName,
      customer_name: fullName || '',
      deal_name: deal.name || '',
      quote_number: (quote && quote.quote_number) || '',
      quote_title: (quote && quote.title) || '',
      quote_total: quoteTotal,
      quote_link: quote && quote.access_token ? `${base}/portal/quote.html?token=${quote.access_token}` : `${base}/portal/login.html`,
      portal_link: `${base}/portal/login.html`,
      company_name: brand.name || '',
      company_phone: brand.phone || '',
      company_website: brand.website || ''
    };
  }

  return { BLOCK_TYPES, MERGE_FIELDS, SAMPLE_VARS, renderEmail, merge, esc, brandFromSettings, buildVars };
});
