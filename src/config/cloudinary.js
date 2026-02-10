/**
 * Cloudinary Configuration
 * Reuses credentials from main server .env
 */

const cloudinary = require('cloudinary').v2;

/**
 * Initialize Cloudinary connection
 */
const cloudinaryConnect = () => {
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      timeout: 120000 // 2 minutes timeout for all operations
    });

    // Validate credentials
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('⚠️  Cloudinary credentials missing - file uploads will fail');
      return false;
    }

    console.log('✅ Cloudinary configured successfully');
    return true;
  } catch (error) {
    console.error('❌ Cloudinary configuration error:', error.message);
    return false;
  }
};

module.exports = { cloudinary, cloudinaryConnect };
