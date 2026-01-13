// =============================================
// HOMESTEAD CABINET DESIGN - SHARED UTILITIES
// =============================================

// Configuration - These will be replaced by environment variables in production
const CONFIG = {
  SUPABASE_URL: 'https://byozvlgtbwiohyrfvxii.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5b3p2bGd0Yndpb2h5cmZ2eGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MDQ0MTYsImV4cCI6MjA4MjI4MDQxNn0.uFCgHLSCbIxRP5YBm7OrJT_jPdygOF8AVIWga8JmNkI',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_51SiPliCxhFCWvROVjZb23sYMMnwfpPJgIeZjfSKQ5NdD5RdW1AvHqQHJwQh4kdd9VY05PoQ3js257QGfn4saa43K00Jr6rsem7',
  SITE_URL: 'https://hcdbooks.netlify.app'
};

// =============================================
// SUPABASE CLIENT
// =============================================

// Load Supabase from CDN
const supabaseScript = document.createElement('script');
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
document.head.appendChild(supabaseScript);

let _supabaseClient = null;
let _supabaseReady = false;
let _supabaseError = null;

// Set up load handlers immediately
supabaseScript.onload = () => {
  _supabaseReady = true;
};
supabaseScript.onerror = (err) => {
  console.error('Failed to load Supabase script:', err);
  _supabaseError = err;
};

function initSupabase() {
  if (!_supabaseClient && window.supabase) {
    _supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}

// Wait for Supabase to load with timeout
function waitForSupabase(timeout = 10000) {
  return new Promise((resolve, reject) => {
    // Already available
    if (window.supabase) {
      resolve(initSupabase());
      return;
    }
    
    // Check for error
    if (_supabaseError) {
      reject(new Error('Supabase script failed to load'));
      return;
    }
    
    const startTime = Date.now();
    
    // Poll for supabase to be available
    const checkInterval = setInterval(() => {
      if (window.supabase) {
        clearInterval(checkInterval);
        resolve(initSupabase());
      } else if (_supabaseError) {
        clearInterval(checkInterval);
        reject(new Error('Supabase script failed to load'));
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error('Timeout waiting for Supabase to load'));
      }
    }, 50);
  });
}

// =============================================
// API HELPERS
// =============================================

async function apiCall(endpoint, options = {}) {
  const url = `/api/${endpoint}`;
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  const response = await fetch(url, { ...defaultOptions, ...options });
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'An error occurred');
  }
  
  return data;
}

// =============================================
// FORMAT HELPERS
// =============================================

function formatCurrency(amount, options = {}) {
  const { showCents = true, currency = 'USD' } = options;
  
  if (amount === null || amount === undefined) return '—';
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  
  return formatter.format(amount);
}

function formatCurrencyRange(low, high, options = {}) {
  if (low === high || !high) {
    return formatCurrency(low, options);
  }
  return `${formatCurrency(low, options)} – ${formatCurrency(high, options)}`;
}

function formatDate(dateString, options = {}) {
  if (!dateString) return '—';
  
  const date = new Date(dateString);
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  
  return date.toLocaleDateString('en-US', { ...defaultOptions, ...options });
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateString) {
  if (!dateString) return '—';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDate(dateString);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function formatPhone(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// =============================================
// DOM HELPERS
// =============================================

function $(selector, parent = document) {
  return parent.querySelector(selector);
}

function $$(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  
  // Boolean attributes that should be set as properties, not attributes
  const booleanAttrs = ['checked', 'disabled', 'selected', 'readonly', 'required', 'hidden'];
  
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'innerHTML') {
      element.innerHTML = value;
    } else if (key === 'textContent') {
      element.textContent = value;
    } else if (key.startsWith('on')) {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else if (booleanAttrs.includes(key)) {
      // Handle boolean attributes - set property directly
      element[key] = !!value;
    } else {
      element.setAttribute(key, value);
    }
  });
  
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child) {
      element.appendChild(child);
    }
  });
  
  return element;
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// =============================================
// TOAST NOTIFICATIONS
// =============================================

const toastContainer = createElement('div', { className: 'toast-container' });
document.body.appendChild(toastContainer);

function showToast(message, type = 'info', duration = 4000) {
  const icons = {
    success: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
    error: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
    warning: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
    info: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>'
  };
  
  const colors = {
    success: 'var(--color-success)',
    error: 'var(--color-danger)',
    warning: 'var(--color-warning)',
    info: 'var(--color-primary)'
  };
  
  const toast = createElement('div', { className: 'toast' }, [
    createElement('span', { 
      innerHTML: icons[type],
      style: `color: ${colors[type]}; width: 20px; height: 20px;`
    }),
    createElement('span', { textContent: message, className: 'flex-1' })
  ]);
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// =============================================
// MODAL HELPERS
// =============================================

function createModal(options = {}) {
  const { title, content, footer, size = 'md', onClose } = options;
  
  const overlay = createElement('div', { className: 'modal-overlay' });
  const modal = createElement('div', { 
    className: 'modal',
    style: size === 'lg' ? 'max-width: 700px;' : size === 'xl' ? 'max-width: 900px;' : ''
  });
  
  const header = createElement('div', { className: 'modal-header' }, [
    createElement('h3', { className: 'modal-title', textContent: title }),
    createElement('button', { 
      className: 'modal-close',
      innerHTML: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>',
      onClick: () => closeModal(overlay)
    })
  ]);
  
  const body = createElement('div', { className: 'modal-body' });
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content) {
    body.appendChild(content);
  }
  
  modal.appendChild(header);
  modal.appendChild(body);
  
  if (footer) {
    const footerEl = createElement('div', { className: 'modal-footer' });
    if (typeof footer === 'string') {
      footerEl.innerHTML = footer;
    } else {
      footerEl.appendChild(footer);
    }
    modal.appendChild(footerEl);
  }
  
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay);
  });
  
  document.body.appendChild(overlay);
  
  // Trigger animation
  requestAnimationFrame(() => overlay.classList.add('active'));
  
  overlay._onClose = onClose;
  
  return overlay;
}

function closeModal(overlay) {
  overlay.classList.remove('active');
  setTimeout(() => {
    if (overlay._onClose) overlay._onClose();
    overlay.remove();
  }, 250);
}

// Confirm dialog
function confirm(message, options = {}) {
  return new Promise((resolve) => {
    const { title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = options;
    
    const cancelBtn = createElement('button', { 
      className: 'btn btn-secondary',
      textContent: cancelText
    });
    const confirmBtn = createElement('button', { 
      className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
      textContent: confirmText
    });
    
    const footer = createElement('div', { className: 'btn-group' }, [cancelBtn, confirmBtn]);
    
    const modal = createModal({
      title,
      content: createElement('p', { textContent: message }),
      footer
    });
    
    cancelBtn.addEventListener('click', () => { closeModal(modal); resolve(false); });
    confirmBtn.addEventListener('click', () => { closeModal(modal); resolve(true); });
  });
}

// =============================================
// FORM HELPERS
// =============================================

function getFormData(form) {
  const formData = new FormData(form);
  const data = {};
  
  formData.forEach((value, key) => {
    // Handle multiple values (checkboxes with same name)
    if (data.hasOwnProperty(key)) {
      if (!Array.isArray(data[key])) {
        data[key] = [data[key]];
      }
      data[key].push(value);
    } else {
      data[key] = value;
    }
  });
  
  return data;
}

function setFormData(form, data) {
  Object.entries(data).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    
    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else if (field.type === 'radio') {
      const radio = form.querySelector(`[name="${key}"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else {
      field.value = value ?? '';
    }
  });
}

function validateForm(form, rules) {
  const errors = {};
  const data = getFormData(form);
  
  Object.entries(rules).forEach(([field, fieldRules]) => {
    const value = data[field];
    
    fieldRules.forEach(rule => {
      if (errors[field]) return; // Skip if already has error
      
      if (rule.required && !value) {
        errors[field] = rule.message || 'This field is required';
      } else if (rule.email && value && !isValidEmail(value)) {
        errors[field] = rule.message || 'Please enter a valid email';
      } else if (rule.minLength && value && value.length < rule.minLength) {
        errors[field] = rule.message || `Must be at least ${rule.minLength} characters`;
      } else if (rule.pattern && value && !rule.pattern.test(value)) {
        errors[field] = rule.message || 'Invalid format';
      } else if (rule.custom && !rule.custom(value, data)) {
        errors[field] = rule.message || 'Invalid value';
      }
    });
  });
  
  // Display errors
  $$('.form-error', form).forEach(el => el.remove());
  $$('.form-input.error', form).forEach(el => el.classList.remove('error'));
  
  Object.entries(errors).forEach(([field, message]) => {
    const input = form.elements[field];
    if (input) {
      input.classList.add('error');
      const errorEl = createElement('div', { className: 'form-error', textContent: message });
      input.parentNode.appendChild(errorEl);
    }
  });
  
  return Object.keys(errors).length === 0;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================
// FILE UPLOAD HELPERS
// =============================================

function createUploadZone(options = {}) {
  const { 
    accept = 'image/*,.pdf',
    multiple = true,
    maxSize = 10 * 1024 * 1024, // 10MB
    onUpload
  } = options;
  
  const input = createElement('input', {
    type: 'file',
    accept,
    multiple,
    style: 'display: none;'
  });
  
  const zone = createElement('div', { className: 'upload-zone' }, [
    createElement('div', { 
      className: 'upload-zone-icon',
      innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>'
    }),
    createElement('div', { className: 'upload-zone-text', textContent: 'Drag photos here or click to browse' }),
    createElement('div', { className: 'upload-zone-hint', textContent: `Accepted: ${accept} (max ${formatFileSize(maxSize)})` }),
    input
  ]);
  
  zone.addEventListener('click', () => input.click());
  
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  
  input.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    input.value = '';
  });
  
  function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => {
      if (file.size > maxSize) {
        showToast(`${file.name} is too large (max ${formatFileSize(maxSize)})`, 'error');
        return false;
      }
      return true;
    });
    
    if (validFiles.length && onUpload) {
      onUpload(validFiles);
    }
  }
  
  return zone;
}

// =============================================
// URL & ROUTING HELPERS
// =============================================

function getUrlParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

function setUrlParams(params) {
  const url = new URL(window.location);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  window.history.replaceState({}, '', url);
}

function navigate(path) {
  window.location.href = path;
}

// =============================================
// LOCAL STORAGE HELPERS
// =============================================

function storage(key, value) {
  if (value === undefined) {
    // Get
    const item = localStorage.getItem(key);
    try {
      return JSON.parse(item);
    } catch {
      return item;
    }
  } else if (value === null) {
    // Remove
    localStorage.removeItem(key);
  } else {
    // Set
    localStorage.setItem(key, JSON.stringify(value));
  }
}

// =============================================
// DEBOUNCE & THROTTLE
// =============================================

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// =============================================
// EXPORT FOR USE
// =============================================

window.app = {
  CONFIG,
  waitForSupabase,
  apiCall,
  formatCurrency,
  formatCurrencyRange,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatFileSize,
  formatPhone,
  $,
  $$,
  createElement,
  clearElement,
  showToast,
  createModal,
  closeModal,
  confirm,
  getFormData,
  setFormData,
  validateForm,
  isValidEmail,
  createUploadZone,
  getUrlParams,
  setUrlParams,
  navigate,
  storage,
  debounce,
  throttle
};

// Also expose as globals for convenience
window.$ = $;
window.$$ = $$;
window.createElement = createElement;
window.clearElement = clearElement;
window.showToast = showToast;
window.createModal = createModal;
window.closeModal = closeModal;
window.confirm = confirm;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatPhone = formatPhone;
window.debounce = debounce;

// =============================================
// USER AUTHENTICATION & ROLES
// =============================================

function getCurrentUser() {
  const userJson = localStorage.getItem('app_user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return !!getCurrentUser();
}

function hasPermission(permission) {
  const user = getCurrentUser();
  return user?.permissions?.[permission] || false;
}

function canAccessSettings() {
  return hasPermission('can_access_settings');
}

function canViewFinancials() {
  return hasPermission('can_view_financials');
}

function canDelete() {
  return hasPermission('can_delete');
}

function canManageUsers() {
  return hasPermission('can_manage_users');
}

function canSendInvoices() {
  return hasPermission('can_send_invoices');
}

function canEditQuotes() {
  return hasPermission('can_edit_quotes');
}

function canEditCustomers() {
  return hasPermission('can_edit_customers');
}

function canEditPipeline() {
  return hasPermission('can_edit_pipeline');
}

// Legacy compatibility
function isAdmin() {
  return canAccessSettings() && canManageUsers();
}

function isShopManager() {
  return !canAccessSettings();
}

function logout() {
  localStorage.removeItem('app_user');
  window.location.href = '/admin/login.html';
}

function requireAuth() {
  // Skip auth check on login page
  if (window.location.pathname.includes('/admin/login.html')) return;
  
  if (!isLoggedIn()) {
    window.location.href = '/admin/login.html';
    return false;
  }
  return true;
}

function requirePermission(permission) {
  if (!requireAuth()) return false;
  if (!hasPermission(permission)) {
    showToast('Access denied. Insufficient permissions.', 'error');
    window.location.href = '/admin/index.html';
    return false;
  }
  return true;
}

// Legacy compatibility
function requireAdmin() {
  return requirePermission('can_access_settings');
}

// Apply role-based UI restrictions
function applyRoleRestrictions() {
  const user = getCurrentUser();
  if (!user) return;
  
  // Page permission mapping - use VIEW permissions for page access
  const pagePermissions = {
    '/admin/settings.html': 'can_access_settings',
    '/admin/quotes.html': 'can_view_quotes',
    '/admin/quote-builder.html': 'can_view_quotes',
    '/admin/quote-detail.html': 'can_view_quotes',
    '/admin/invoices.html': 'can_view_invoices',
    '/admin/customers.html': 'can_view_customers',
    '/admin/pipeline.html': 'can_view_pipeline',
    '/admin/catalog.html': 'can_view_quotes',
    '/admin/booking-forms.html': 'can_access_settings'
  };
  
  // Check if current page is allowed
  const currentPath = window.location.pathname;
  const requiredPermission = pagePermissions[currentPath];
  
  if (requiredPermission && !user.permissions?.[requiredPermission]) {
    // Redirect to a page they CAN access
    if (user.permissions?.can_view_pipeline) {
      window.location.href = '/admin/pipeline.html';
    } else if (user.permissions?.can_view_customers) {
      window.location.href = '/admin/customers.html';
    } else if (user.permissions?.can_view_quotes) {
      window.location.href = '/admin/quotes.html';
    } else {
      window.location.href = '/admin/index.html';
    }
    return;
  }
  
  // Hide sidebar links based on VIEW permissions
  const sidebarPermissions = {
    'settings.html': 'can_access_settings',
    'quotes.html': 'can_view_quotes',
    'quote-builder.html': 'can_view_quotes',
    'invoices.html': 'can_view_invoices',
    'customers.html': 'can_view_customers',
    'pipeline.html': 'can_view_pipeline',
    'catalog.html': 'can_view_quotes',
    'booking-forms.html': 'can_access_settings'
  };
  
  $$('.sidebar-nav-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    for (const [page, permission] of Object.entries(sidebarPermissions)) {
      if (href.includes(page) && !user.permissions?.[permission]) {
        const listItem = link.closest('.sidebar-nav-item');
        if (listItem) listItem.style.display = 'none';
        break;
      }
    }
  });
  
  // Hide empty sidebar sections
  $$('.sidebar-section').forEach(section => {
    const visibleItems = section.querySelectorAll('.sidebar-nav-item:not([style*="display: none"])');
    if (visibleItems.length === 0) {
      section.style.display = 'none';
    }
  });
  
  if (!user.permissions?.can_delete) {
    // Hide delete buttons
    $$('[data-action="delete"], .btn-danger').forEach(btn => {
      const text = btn.textContent?.toLowerCase() || '';
      const onclick = btn.getAttribute('onclick') || '';
      if (text.includes('delete') || onclick.includes('delete')) {
        btn.style.display = 'none';
      }
    });
  }
  
  if (!user.permissions?.can_view_financials) {
    // Hide financial info with data-financial attribute
    $$('[data-financial]').forEach(el => el.style.display = 'none');
  }
  
  // Hide elements with data-permission attribute
  $$('[data-permission]').forEach(el => {
    const permission = el.dataset.permission;
    if (!hasPermission(permission)) {
      el.style.display = 'none';
    }
  });
  
  // Add user info to header if exists
  const header = $('.app-header');
  if (header && !$('.user-badge', header)) {
    const userBadge = createElement('div', {
      className: 'user-badge',
      style: 'display: flex; align-items: center; gap: var(--space-sm); margin-left: auto; padding-left: var(--space-lg);',
      innerHTML: `
        <span style="font-size: 0.875rem; color: var(--color-text-muted);">${user.name}</span>
        <button class="btn btn-ghost btn-sm" onclick="logout()" title="Logout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
        </button>
      `
    });
    header.appendChild(userBadge);
  }
}

// Run auth check and apply restrictions when DOM is ready
// Run auth check and apply restrictions when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Only check auth on admin pages
  if (window.location.pathname.includes('/admin/')) {
    if (requireAuth()) {
      applyRoleRestrictions();
    }
  }
  
  // Load and apply brand settings on all pages (don't block anything)
  loadBrandSettings().catch(e => console.log('Brand settings error:', e));
});

// =============================================
// BRAND SETTINGS
// =============================================

async function loadBrandSettings() {
  try {
    const supabase = await waitForSupabase();
    const { data: settings, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'branding')
      .maybeSingle();
    
    if (error) {
      console.log('Brand settings query error:', error.message);
      return;
    }
    
    if (settings?.value) {
      const branding = settings.value;
      if (branding.color) {
        applyBrandColor(branding.color);
      }
    }
  } catch (e) {
    // Silently fail - will use default colors
    console.log('Brand settings not loaded:', e.message);
  }
}

function applyBrandColor(color) {
  document.documentElement.style.setProperty('--color-primary', color);
  
  // Also set lighter/darker variants
  const hsl = hexToHSL(color);
  if (hsl) {
    document.documentElement.style.setProperty('--color-primary-light', `hsl(${hsl.h}, ${hsl.s}%, ${Math.min(hsl.l + 15, 95)}%)`);
    document.documentElement.style.setProperty('--color-primary-dark', `hsl(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 15, 20)}%)`);
  }
}

function hexToHSL(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse hex
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;
  
  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

window.loadBrandSettings = loadBrandSettings;
window.applyBrandColor = applyBrandColor;

// Export auth functions
window.getCurrentUser = getCurrentUser;
window.isLoggedIn = isLoggedIn;
window.hasPermission = hasPermission;
window.canAccessSettings = canAccessSettings;
window.canViewFinancials = canViewFinancials;
window.canDelete = canDelete;
window.canManageUsers = canManageUsers;
window.canSendInvoices = canSendInvoices;
window.canEditQuotes = canEditQuotes;
window.canEditCustomers = canEditCustomers;
window.canEditPipeline = canEditPipeline;
window.isAdmin = isAdmin;
window.isShopManager = isShopManager;
window.logout = logout;
window.requireAuth = requireAuth;
window.requirePermission = requirePermission;
window.requireAdmin = requireAdmin;
window.applyRoleRestrictions = applyRoleRestrictions;
