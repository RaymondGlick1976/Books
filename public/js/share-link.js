/**
 * Share Link — text or copy a customer link to a quote or invoice.
 *
 * Usage:  ShareLink.open({ table: 'quotes' | 'invoices', record, customer })
 *   record   — the quote/invoice row (needs id; uses access_token, status,
 *              quote_number/invoice_number, title, amount_due, customer_id)
 *   customer — optional { name, first_name, phone }. If phone is missing it is
 *              looked up from customers by record.customer_id.
 *
 * "Open in Messages" uses an sms: link, so the text goes out from your own
 * phone (or Phone Link / Messages on a computer). Nothing is sent by the app.
 * Requires /js/utils.js (createModal, closeModal, showToast, app).
 */
(function () {
  const BUSINESS_NAME = 'Homestead Cabinet Design';

  function makeToken(table) {
    // Match the formats the app already uses for each table
    if (table === 'invoices') {
      return Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return crypto.randomUUID();
  }

  async function ensureToken(table, record) {
    if (record.access_token) return record.access_token;
    const supabase = await app.waitForSupabase();
    const token = makeToken(table);
    const { error } = await supabase.from(table).update({ access_token: token }).eq('id', record.id);
    if (error) throw error;
    record.access_token = token;
    return token;
  }

  async function loadCustomer(record, customer) {
    const c = Object.assign({}, customer || {});
    if ((!c.phone || !c.name) && record.customer_id) {
      try {
        const supabase = await app.waitForSupabase();
        const { data } = await supabase
          .from('customers')
          .select('name, first_name, phone')
          .eq('id', record.customer_id)
          .single();
        if (data) Object.keys(data).forEach(k => { if (!c[k] && data[k]) c[k] = data[k]; });
      } catch (e) { /* phone is optional */ }
    }
    return c;
  }

  function linkFor(table, token) {
    const page = table === 'invoices' ? 'invoice' : 'quote';
    return `${window.location.origin}/portal/${page}.html?token=${token}`;
  }

  function firstNameOf(c) {
    if (c.first_name) return c.first_name.trim();
    return (c.name || '').trim().split(/\s+/)[0] || '';
  }

  function defaultMessage(table, record, customer, url) {
    const hi = firstNameOf(customer) ? `Hi ${firstNameOf(customer)}, ` : 'Hi, ';
    if (table === 'invoices') {
      const num = record.invoice_number ? ` #${record.invoice_number}` : '';
      return `${hi}here's your invoice${num} from ${BUSINESS_NAME}. You can view and pay it here: ${url}`;
    }
    return `${hi}here's your quote from ${BUSINESS_NAME}. Optional items aren't in the total until you tap "Add" next to them. Review it here:\n${url}\n\nQuestions? Call or text 413-450-0028.`;
  }

  // Digits only, keep a leading + ; add +1 for 10-digit US numbers
  function cleanPhone(p) {
    if (!p) return '';
    let s = String(p).trim();
    const plus = s.startsWith('+');
    s = s.replace(/\D/g, '');
    if (!s) return '';
    if (plus) return '+' + s;
    if (s.length === 10) return '+1' + s;
    if (s.length === 11 && s[0] === '1') return '+' + s;
    return s;
  }

  function smsHref(phone, body) {
    // "?&body=" works on both iPhone and Android
    return `sms:${cleanPhone(phone)}?&body=${encodeURIComponent(body)}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
      return ok;
    }
  }

  async function markSent(table, record) {
    if (record.status !== 'draft') return;
    try {
      const supabase = await app.waitForSupabase();
      const { error } = await supabase.from(table)
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', record.id);
      if (!error) record.status = 'sent';
    } catch (e) { console.warn('Could not mark as sent', e); }
  }

  async function open({ table, record, customer, onSent } = {}) {
    if (!record || !record.id) return;
    let token, cust;
    try {
      [token, cust] = await Promise.all([ensureToken(table, record), loadCustomer(record, customer)]);
    } catch (err) {
      console.error('Share link error:', err);
      showToast('Could not create the customer link', 'error');
      return;
    }

    const url = linkFor(table, token);
    const noun = table === 'invoices' ? 'invoice' : 'quote';
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

    const content = `
      <div class="form-group">
        <label class="form-label">Customer's mobile number</label>
        <input type="tel" class="form-input" data-sl="phone" value="${esc(cust.phone)}" placeholder="(413) 555-1234">
        ${cust.phone ? '' : '<p class="text-sm text-muted" style="margin-top:4px;">No phone on file — type one in, or leave blank and pick the contact in Messages.</p>'}
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea class="form-textarea" data-sl="msg" rows="4">${esc(defaultMessage(table, record, cust, url))}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Link only</label>
        <div style="display:flex;gap:8px;">
          <input type="text" class="form-input" data-sl="url" value="${esc(url)}" readonly style="flex:1;font-size:13px;">
          <button type="button" class="btn btn-secondary" data-sl="copy-link">Copy</button>
        </div>
      </div>
      ${record.status === 'draft' ? `
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;">
        <input type="checkbox" data-sl="mark" checked> Mark ${noun} as sent
      </label>` : ''}
    `;

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;width:100%;';
    footer.innerHTML = `
      <button type="button" class="btn btn-secondary" data-sl="copy-msg">Copy Message</button>
      <a class="btn btn-primary" data-sl="sms" href="#">💬 Open in Messages</a>
    `;

    const overlay = createModal({ title: `Text ${noun} link`, content, footer });
    const q = k => overlay.querySelector(`[data-sl="${k}"]`);

    const maybeMark = async () => {
      const box = q('mark');
      if (box && box.checked) {
        await markSent(table, record);
        if (typeof onSent === 'function') onSent(record);
      }
    };

    const smsBtn = q('sms');
    const refreshHref = () => { smsBtn.href = smsHref(q('phone').value, q('msg').value); };
    refreshHref();
    q('phone').addEventListener('input', refreshHref);
    q('msg').addEventListener('input', refreshHref);
    smsBtn.addEventListener('click', () => {
      refreshHref();
      maybeMark();
      setTimeout(() => closeModal(overlay), 300);
    });

    q('copy-link').addEventListener('click', async () => {
      if (await copyText(url)) showToast('Link copied', 'success');
      else showToast('Copy failed — select the link and copy it', 'error');
    });
    q('copy-msg').addEventListener('click', async () => {
      if (await copyText(q('msg').value)) {
        showToast('Message copied — paste it into a text', 'success');
        maybeMark();
      } else {
        showToast('Copy failed', 'error');
      }
    });
  }

  window.ShareLink = { open, linkFor, smsHref };
})();
