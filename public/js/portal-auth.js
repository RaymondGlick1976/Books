// =============================================
// PORTAL AUTHENTICATION
// Include this on all portal pages (except login)
// =============================================

(function() {
  // Check if we're on the login or verify page
  if (window.location.pathname.includes('/portal/login') || 
      window.location.pathname.includes('/portal/verify')) {
    return;
  }
  
  // Check if public access is enabled (set by page before including this script)
  // Also check URL for token parameter
  const params = new URLSearchParams(window.location.search);
  const hasToken = params.get('token');
  
  if (window.skipAuthCheck || hasToken) {
    // Skip auth check for public access
    return;
  }
  
  // Check for session (localStorage flag set during login)
  const hasSession = localStorage.getItem('portal_logged_in') === 'true';
  
  if (!hasSession) {
    // Redirect to login
    window.location.href = '/portal/login.html';
    return;
  }
  
  // Add logout function to global scope
  window.portalLogout = async function() {
    try {
      await fetch('/api/portal-logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    
    // Clear localStorage
    localStorage.removeItem('portal_logged_in');
    
    window.location.href = '/portal/login.html';
  };
  
  // Add auth check to all API calls
  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    // Add credentials to portal API calls
    if (url.startsWith('/api/portal')) {
      options.credentials = 'include';
    }
    
    const response = await originalFetch(url, options);
    
    // If we get a 401, redirect to login
    if (response.status === 401 && url.startsWith('/api/portal')) {
      localStorage.removeItem('portal_logged_in');
      window.location.href = '/portal/login.html?error=session_expired';
      return;
    }
    
    return response;
  };
})();
