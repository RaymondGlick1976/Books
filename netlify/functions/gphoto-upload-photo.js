// =============================================
// GOOGLE PHOTOS UPLOAD - Upload a photo to Google Photos
// =============================================

const { getGPhotoConnection, uploadToGooglePhotos, getOrCreateAlbum } = require('./gphoto-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method not allowed' };
  }

  try {
    const { file_url, file_name, album_name } = JSON.parse(event.body);

    if (!file_url || !file_name) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'file_url and file_name are required' })
      };
    }

    // Get authenticated connection
    const connection = await getGPhotoConnection();

    // Download the image from Supabase Storage
    const imageResponse = await fetch(file_url);
    if (!imageResponse.ok) {
      throw new Error('Failed to download image from storage');
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Optionally create/get album
    let albumId = null;
    if (album_name) {
      albumId = await getOrCreateAlbum(connection.access_token, album_name);
    }

    // Upload to Google Photos
    const result = await uploadToGooglePhotos(
      connection.access_token,
      imageBuffer,
      file_name,
      albumId
    );

    const mediaItem = result.newMediaItemResults?.[0];
    if (mediaItem?.status?.code && mediaItem.status.code !== 0) {
      throw new Error(mediaItem.status.message || 'Upload failed');
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        mediaItem: mediaItem?.mediaItem || null
      })
    };

  } catch (err) {
    console.error('GPhoto upload error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message })
    };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
