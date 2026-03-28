/**
 * Homestead Cabinet Design - Booking Form Embed Script
 * Usage: <div id="hcd-booking-form"></div>
 *        <script src="https://yoursite.netlify.app/js/booking-embed.js" data-form="your-form-slug"></script>
 */
(function() {
  'use strict';

  // Find the script tag to get configuration
  const currentScript = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const formSlug = currentScript.getAttribute('data-form') || 'default';
  const containerId = currentScript.getAttribute('data-container') || 'hcd-booking-form';
  const apiBase = currentScript.src.replace('/js/booking-embed.js', '');

  // State
  let formConfig = null;
  let questions = [];
  let uploadedFiles = [];
  let primaryColor = '#38571a';

  // Wait for DOM to be ready
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  // Inject styles
  function injectStyles() {
    if (document.getElementById('hcd-booking-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'hcd-booking-styles';
    style.textContent = `
      .hcd-booking-form * { box-sizing: border-box; margin: 0; padding: 0; }
      .hcd-booking-form { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; padding: 24px; border-radius: 8px; }
      .hcd-form-header { text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
      .hcd-form-title { font-size: 1.5rem; font-weight: 600; margin-bottom: 8px; color: var(--hcd-primary, #38571a); }
      .hcd-form-desc { color: #666; font-size: 0.95rem; }
      .hcd-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .hcd-form-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
      .hcd-form-group { margin-bottom: 16px; }
      .hcd-form-group.full { grid-column: 1 / -1; }
      .hcd-form-label { display: block; font-size: 0.875rem; font-weight: 500; color: #333; margin-bottom: 6px; }
      .hcd-required { color: #e53e3e; }
      .hcd-form-input, .hcd-form-select, .hcd-form-textarea {
        width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px;
        font-size: 0.95rem; transition: border-color 0.2s, box-shadow 0.2s;
        font-family: inherit;
      }
      .hcd-form-input:focus, .hcd-form-select:focus, .hcd-form-textarea:focus {
        outline: none; border-color: var(--hcd-primary, #38571a);
        box-shadow: 0 0 0 3px rgba(56, 87, 26, 0.1);
      }
      .hcd-form-textarea { min-height: 100px; resize: vertical; }
      .hcd-upload-zone {
        border: 2px dashed #ddd; border-radius: 8px; padding: 30px;
        text-align: center; cursor: pointer; transition: all 0.2s;
      }
      .hcd-upload-zone:hover, .hcd-upload-zone.drag-over {
        border-color: var(--hcd-primary, #38571a); background: rgba(56, 87, 26, 0.05);
      }
      .hcd-upload-text { color: #999; margin-bottom: 10px; }
      .hcd-upload-btn {
        background: var(--hcd-primary, #38571a); color: white; border: none;
        padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.875rem;
      }
      .hcd-upload-preview { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; }
      .hcd-upload-item { position: relative; width: 70px; height: 70px; border-radius: 6px; overflow: hidden; }
      .hcd-upload-item img { width: 100%; height: 100%; object-fit: cover; }
      .hcd-upload-remove {
        position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6);
        color: white; border: none; width: 20px; height: 20px; border-radius: 50%;
        cursor: pointer; font-size: 12px; line-height: 18px;
      }
      .hcd-consent-box { background: #f9fafb; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
      .hcd-consent-text { font-size: 0.75rem; color: #666; line-height: 1.5; }
      .hcd-consent-check { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; }
      .hcd-consent-check input { margin-top: 3px; }
      .hcd-submit-btn {
        width: 100%; padding: 14px; font-size: 1rem; font-weight: 600;
        color: white; background: var(--hcd-primary, #38571a); border: none;
        border-radius: 6px; cursor: pointer; transition: all 0.2s;
      }
      .hcd-submit-btn:hover { opacity: 0.9; }
      .hcd-submit-btn:disabled { background: #ccc; cursor: not-allowed; }
      .hcd-thank-you { text-align: center; padding: 40px 20px; }
      .hcd-thank-you-icon { font-size: 3rem; margin-bottom: 16px; }
      .hcd-thank-you-title { font-size: 1.5rem; font-weight: 600; margin-bottom: 8px; }
      .hcd-thank-you-message { color: #666; }
      .hcd-loading { text-align: center; padding: 40px; }
      .hcd-spinner {
        width: 36px; height: 36px; border: 3px solid #eee;
        border-top-color: var(--hcd-primary, #38571a); border-radius: 50%;
        animation: hcd-spin 1s linear infinite; margin: 0 auto 16px;
      }
      @keyframes hcd-spin { to { transform: rotate(360deg); } }
      .hcd-error { color: #e53e3e; background: #fef2f2; padding: 12px; border-radius: 6px; margin-bottom: 16px; }
      .hcd-radio-group label, .hcd-checkbox-label { display: flex; align-items: center; gap: 8px; padding: 6px 0; cursor: pointer; }
      @media (max-width: 600px) {
        .hcd-form-grid, .hcd-form-grid-3 { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  // Fetch form configuration
  async function fetchFormConfig() {
    try {
      const response = await fetch(`${apiBase}/.netlify/functions/booking-form?slug=${encodeURIComponent(formSlug)}`);
      if (!response.ok) throw new Error('Form not found');
      const data = await response.json();
      formConfig = data.form;
      questions = data.questions || [];
      primaryColor = formConfig.primary_color || '#38571a';
      return true;
    } catch (err) {
      console.error('HCD Booking Form Error:', err);
      return false;
    }
  }

  // Render the form
  function renderForm(container) {
    container.style.setProperty('--hcd-primary', primaryColor);
    
    let html = `
      <div class="hcd-booking-form">
        <div class="hcd-form-header">
          <h2 class="hcd-form-title">${escapeHtml(formConfig.header_title || 'Request an Appointment')}</h2>
          ${formConfig.header_description ? `<p class="hcd-form-desc">${escapeHtml(formConfig.header_description)}</p>` : ''}
        </div>
        
        <form id="hcd-booking-form-element">
          <input type="hidden" id="hcd-form-id" value="${formConfig.id}">
          
          <!-- Contact Info -->
          <div class="hcd-form-grid">
            <div class="hcd-form-group">
              <label class="hcd-form-label">First Name <span class="hcd-required">*</span></label>
              <input type="text" class="hcd-form-input" id="hcd-first-name" required placeholder="First Name">
            </div>
            <div class="hcd-form-group">
              <label class="hcd-form-label">Last Name <span class="hcd-required">*</span></label>
              <input type="text" class="hcd-form-input" id="hcd-last-name" required placeholder="Last Name">
            </div>
          </div>
          
          <div class="hcd-form-grid">
            <div class="hcd-form-group">
              <label class="hcd-form-label">Email Address <span class="hcd-required">*</span></label>
              <input type="email" class="hcd-form-input" id="hcd-email" required placeholder="Your Email">
            </div>
            <div class="hcd-form-group">
              <label class="hcd-form-label">Phone Number <span class="hcd-required">*</span></label>
              <input type="tel" class="hcd-form-input" id="hcd-phone" required placeholder="Your Phone">
            </div>
          </div>
    `;

    // Address section
    if (formConfig.show_address) {
      html += `
        <div class="hcd-form-group">
          <label class="hcd-form-label">Address <span class="hcd-required">*</span></label>
          <input type="text" class="hcd-form-input" id="hcd-address" required placeholder="Street Address">
        </div>
        <div class="hcd-form-grid-3">
          <div class="hcd-form-group">
            <label class="hcd-form-label">City <span class="hcd-required">*</span></label>
            <input type="text" class="hcd-form-input" id="hcd-city" required placeholder="City">
          </div>
          <div class="hcd-form-group">
            <label class="hcd-form-label">State <span class="hcd-required">*</span></label>
            <input type="text" class="hcd-form-input" id="hcd-state" required placeholder="State">
          </div>
          <div class="hcd-form-group">
            <label class="hcd-form-label">ZIP <span class="hcd-required">*</span></label>
            <input type="text" class="hcd-form-input" id="hcd-zip" required placeholder="ZIP">
          </div>
        </div>
      `;
    }

    // Service Details
    if (formConfig.show_service_details) {
      html += `
        <div class="hcd-form-group">
          <label class="hcd-form-label">Service Details <span class="hcd-required">*</span></label>
          <textarea class="hcd-form-textarea" id="hcd-service-details" required placeholder="Please describe your project..."></textarea>
        </div>
      `;
    }

    // How Heard
    if (formConfig.show_how_heard) {
      html += `
        <div class="hcd-form-group">
          <label class="hcd-form-label">How did you hear about us? <span class="hcd-required">*</span></label>
          <select class="hcd-form-select" id="hcd-how-heard" required>
            <option value="">Select...</option>
            <option value="Google">Google Search</option>
            <option value="Facebook">Facebook</option>
            <option value="Instagram">Instagram</option>
            <option value="Referral">Referral from Friend/Family</option>
            <option value="Houzz">Houzz</option>
            <option value="Home Show">Home Show</option>
            <option value="Other">Other</option>
          </select>
        </div>
      `;
    }

    // Date/Time
    if (formConfig.show_date_time) {
      html += `
        <div class="hcd-form-grid">
          <div class="hcd-form-group">
            <label class="hcd-form-label">Preferred Date</label>
            <input type="date" class="hcd-form-input" id="hcd-preferred-date">
          </div>
          <div class="hcd-form-group">
            <label class="hcd-form-label">Preferred Time</label>
            <input type="time" class="hcd-form-input" id="hcd-preferred-time">
          </div>
        </div>
      `;
    }

    // Custom Questions
    questions.forEach(q => {
      const req = q.is_required ? '<span class="hcd-required">*</span>' : '';
      const reqAttr = q.is_required ? 'required' : '';
      
      if (q.field_type === 'textarea') {
        html += `
          <div class="hcd-form-group">
            <label class="hcd-form-label">${escapeHtml(q.prompt)} ${req}</label>
            <textarea class="hcd-form-textarea" id="hcd-q-${q.id}" ${reqAttr}></textarea>
          </div>
        `;
      } else if (q.field_type === 'dropdown') {
        const opts = (q.choices || []).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        html += `
          <div class="hcd-form-group">
            <label class="hcd-form-label">${escapeHtml(q.prompt)} ${req}</label>
            <select class="hcd-form-select" id="hcd-q-${q.id}" ${reqAttr}>
              <option value="">Select...</option>
              ${opts}
            </select>
          </div>
        `;
      } else if (q.field_type === 'radio') {
        const opts = (q.choices || []).map((c, i) => 
          `<label><input type="radio" name="hcd-q-${q.id}" value="${escapeHtml(c)}" ${q.is_required && i === 0 ? 'required' : ''}> ${escapeHtml(c)}</label>`
        ).join('');
        html += `
          <div class="hcd-form-group">
            <label class="hcd-form-label">${escapeHtml(q.prompt)} ${req}</label>
            <div class="hcd-radio-group">${opts}</div>
          </div>
        `;
      } else if (q.field_type === 'checkbox') {
        html += `
          <div class="hcd-form-group">
            <label class="hcd-checkbox-label">
              <input type="checkbox" id="hcd-q-${q.id}" ${reqAttr}>
              ${escapeHtml(q.prompt)}
            </label>
          </div>
        `;
      } else {
        html += `
          <div class="hcd-form-group">
            <label class="hcd-form-label">${escapeHtml(q.prompt)} ${req}</label>
            <input type="text" class="hcd-form-input" id="hcd-q-${q.id}" ${reqAttr}>
          </div>
        `;
      }
    });

    // Attachments
    if (formConfig.allow_attachments) {
      const reqLabel = formConfig.attachments_required ? ' <span class="hcd-required">*</span>' : '';
      html += `
        <div class="hcd-form-group">
          <label class="hcd-form-label">Photos of Your Project${reqLabel}</label>
          <div class="hcd-upload-zone" id="hcd-upload-zone">
            <div class="hcd-upload-text">Drag & Drop Images Here</div>
            <div style="color:#999;margin:8px 0;">or</div>
            <button type="button" class="hcd-upload-btn" id="hcd-upload-btn">Browse Files</button>
            <input type="file" id="hcd-file-input" multiple accept="image/*" style="display:none;">
          </div>
          <div class="hcd-upload-preview" id="hcd-upload-preview"></div>
        </div>
      `;
    }

    // SMS Consent
    if (formConfig.show_sms_consent) {
      html += `
        <div class="hcd-consent-box">
          <div class="hcd-consent-check">
            <input type="checkbox" id="hcd-sms-consent">
            <span class="hcd-consent-text">
              I agree to receive text messages from Homestead Cabinet Design. Message frequency varies. 
              Message and data rates may apply. Reply STOP to unsubscribe. Reply HELP for help.
            </span>
          </div>
        </div>
      `;
    }

    html += `
          <button type="submit" class="hcd-submit-btn" id="hcd-submit-btn">Submit Request</button>
        </form>
        
        <div class="hcd-thank-you" id="hcd-thank-you" style="display:none;">
          <div class="hcd-thank-you-icon">✓</div>
          <h3 class="hcd-thank-you-title">${escapeHtml(formConfig.thank_you_title || 'Thank You!')}</h3>
          <p class="hcd-thank-you-message">${escapeHtml(formConfig.thank_you_message || 'We have received your request and will contact you shortly.')}</p>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Setup event handlers
    setupEventHandlers(container);
  }

  // Setup event handlers
  function setupEventHandlers(container) {
    // File upload
    if (formConfig.allow_attachments) {
      const uploadZone = container.querySelector('#hcd-upload-zone');
      const fileInput = container.querySelector('#hcd-file-input');
      const uploadBtn = container.querySelector('#hcd-upload-btn');
      const preview = container.querySelector('#hcd-upload-preview');

      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => handleFiles(e.target.files, preview));

      uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
      });
      uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files, preview);
      });
    }

    // Form submission
    const form = container.querySelector('#hcd-booking-form-element');
    form.addEventListener('submit', (e) => handleSubmit(e, container));
  }

  // Handle file uploads
  function handleFiles(files, preview) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (uploadedFiles.length >= 10) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        uploadedFiles.push({ file, dataUrl: e.target.result });
        renderPreviews(preview);
      };
      reader.readAsDataURL(file);
    });
  }

  function renderPreviews(preview) {
    preview.innerHTML = uploadedFiles.map((f, i) => `
      <div class="hcd-upload-item">
        <img src="${f.dataUrl}" alt="Upload ${i + 1}">
        <button type="button" class="hcd-upload-remove" data-index="${i}">×</button>
      </div>
    `).join('');

    // Add remove handlers
    preview.querySelectorAll('.hcd-upload-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-index'));
        uploadedFiles.splice(index, 1);
        renderPreviews(preview);
      });
    });
  }

  // Handle form submission
  async function handleSubmit(e, container) {
    e.preventDefault();

    const submitBtn = container.querySelector('#hcd-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    // Check for required attachments
    if (formConfig.attachments_required && uploadedFiles.length === 0) {
      alert('Please upload at least one photo.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
      return;
    }

    // Gather form data
    const formData = {
      form_id: container.querySelector('#hcd-form-id').value,
      first_name: container.querySelector('#hcd-first-name').value,
      last_name: container.querySelector('#hcd-last-name').value,
      email: container.querySelector('#hcd-email').value,
      phone: container.querySelector('#hcd-phone').value,
      address: container.querySelector('#hcd-address')?.value || '',
      city: container.querySelector('#hcd-city')?.value || '',
      state: container.querySelector('#hcd-state')?.value || '',
      zip: container.querySelector('#hcd-zip')?.value || '',
      service_details: container.querySelector('#hcd-service-details')?.value || '',
      how_heard: container.querySelector('#hcd-how-heard')?.value || '',
      preferred_date: container.querySelector('#hcd-preferred-date')?.value || null,
      preferred_time: container.querySelector('#hcd-preferred-time')?.value || null,
      sms_consent: container.querySelector('#hcd-sms-consent')?.checked || false,
      custom_answers: {},
      attachments: []
    };

    // Custom questions
    questions.forEach(q => {
      if (q.field_type === 'radio') {
        const checked = container.querySelector(`input[name="hcd-q-${q.id}"]:checked`);
        formData.custom_answers[q.id] = checked ? checked.value : '';
      } else if (q.field_type === 'checkbox') {
        formData.custom_answers[q.id] = container.querySelector(`#hcd-q-${q.id}`)?.checked || false;
      } else {
        formData.custom_answers[q.id] = container.querySelector(`#hcd-q-${q.id}`)?.value || '';
      }
    });

    // Attachments
    if (uploadedFiles.length > 0) {
      for (const f of uploadedFiles) {
        formData.attachments.push(f.dataUrl);
      }
    }

    try {
      const response = await fetch(`${apiBase}/.netlify/functions/booking-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Submission failed');
      }

      // Show thank you
      container.querySelector('#hcd-booking-form-element').style.display = 'none';
      container.querySelector('.hcd-form-header').style.display = 'none';
      container.querySelector('#hcd-thank-you').style.display = 'block';

    } catch (err) {
      console.error('HCD Form Error:', err);
      alert('There was an error submitting your request. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }
  }

  // Utility: escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  ready(async function() {
    injectStyles();

    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`HCD Booking Form: Container #${containerId} not found`);
      return;
    }

    // Show loading state
    container.innerHTML = `
      <div class="hcd-booking-form">
        <div class="hcd-loading">
          <div class="hcd-spinner"></div>
          <p>Loading form...</p>
        </div>
      </div>
    `;
    container.style.setProperty('--hcd-primary', primaryColor);

    // Fetch and render
    const success = await fetchFormConfig();
    if (success) {
      renderForm(container);
    } else {
      container.innerHTML = `
        <div class="hcd-booking-form">
          <div class="hcd-error">
            Unable to load the booking form. Please try again later.
          </div>
        </div>
      `;
    }
  });

})();
