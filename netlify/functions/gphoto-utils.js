// =============================================
// GOOGLE PHOTOS API UTILITIES
// =============================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get the Google Photos connection and refresh token if needed
async function getGPhotoConnection() {
  const { data: connection, error } = await supabase
    .from('google_photos_connection')
    .select('*')
    .single();

  if (error || !connection) {
    throw new Error('Google Photos not connected');
  }

  // Check if token is expired or will expire in next 5 minutes
  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - now < fiveMinutes) {
    const newTokens = await refreshAccessToken(connection.refresh_token);

    const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();
    await supabase
      .from('google_photos_connection')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || connection.refresh_token,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    connection.access_token = newTokens.access_token;
  }

  return connection;
}

// Refresh the access token
async function refreshAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const tokens = await response.json();

  if (!response.ok || tokens.error) {
    throw new Error('Failed to refresh Google token: ' + (tokens.error_description || tokens.error));
  }

  return tokens;
}

// Upload bytes to Google Photos (step 1: upload raw bytes, step 2: create media item)
async function uploadToGooglePhotos(accessToken, imageBytes, fileName, albumId) {
  // Step 1: Upload raw bytes to get an upload token
  const uploadResponse = await fetch('https://photoslibrary.googleapis.com/v1/uploads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'X-Goog-Upload-File-Name': fileName,
      'X-Goog-Upload-Protocol': 'raw'
    },
    body: imageBytes
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload bytes to Google Photos');
  }

  const uploadToken = await uploadResponse.text();

  // Step 2: Create media item
  const createBody = {
    newMediaItems: [{
      description: fileName,
      simpleMediaItem: { uploadToken, fileName }
    }]
  };

  if (albumId) {
    createBody.albumId = albumId;
  }

  const createResponse = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(createBody)
  });

  const createData = await createResponse.json();

  if (!createResponse.ok) {
    throw new Error(createData.error?.message || 'Failed to create media item in Google Photos');
  }

  return createData;
}

// Create or get album by name
async function getOrCreateAlbum(accessToken, albumName) {
  // List albums to see if one exists
  const listResponse = await fetch('https://photoslibrary.googleapis.com/v1/albums?pageSize=50', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const listData = await listResponse.json();

  if (listData.albums) {
    const existing = listData.albums.find(a => a.title === albumName);
    if (existing) return existing.id;
  }

  // Create new album
  const createResponse = await fetch('https://photoslibrary.googleapis.com/v1/albums', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ album: { title: albumName } })
  });

  const album = await createResponse.json();
  if (!createResponse.ok) {
    throw new Error('Failed to create album: ' + (album.error?.message || 'Unknown error'));
  }

  return album.id;
}

// Check connection status
async function getConnectionStatus() {
  try {
    const { data: connection } = await supabase
      .from('google_photos_connection')
      .select('connected_at, token_expires_at')
      .single();

    if (!connection) {
      return { connected: false };
    }

    return {
      connected: true,
      connectedAt: connection.connected_at,
      tokenExpiresAt: connection.token_expires_at
    };
  } catch (err) {
    return { connected: false };
  }
}

module.exports = {
  getGPhotoConnection,
  refreshAccessToken,
  uploadToGooglePhotos,
  getOrCreateAlbum,
  getConnectionStatus,
  supabase
};
