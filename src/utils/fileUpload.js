/**
 * File Upload Utility
 * Cloudinary-based file upload for task submissions and documents
 */

const { cloudinary } = require('../config/cloudinary');
const path = require('path');

// Allowed file types and their extensions
const ALLOWED_FILE_TYPES = {
  // Documents
  'application/pdf': { ext: '.pdf', category: 'document' },
  'application/msword': { ext: '.doc', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', category: 'document' },
  'application/vnd.ms-excel': { ext: '.xls', category: 'document' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: '.xlsx', category: 'document' },
  'application/vnd.ms-powerpoint': { ext: '.ppt', category: 'document' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: '.pptx', category: 'document' },
  'text/plain': { ext: '.txt', category: 'document' },
  // Images
  'image/jpeg': { ext: '.jpg', category: 'image' },
  'image/png': { ext: '.png', category: 'image' },
  'image/gif': { ext: '.gif', category: 'image' },
  'image/webp': { ext: '.webp', category: 'image' }
};

// Max file sizes (in bytes)
const MAX_FILE_SIZES = {
  document: 10 * 1024 * 1024, // 10MB for documents
  image: 5 * 1024 * 1024      // 5MB for images
};

/**
 * Validate file before upload
 * @param {Object} file - File object with mimetype and size
 * @returns {Object} - { valid: boolean, error?: string, category?: string }
 */
const validateFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const fileType = ALLOWED_FILE_TYPES[file.mimetype];
  if (!fileType) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, PNG, GIF, WEBP`
    };
  }

  const maxSize = MAX_FILE_SIZES[fileType.category];
  if (file.size > maxSize) {
    const maxSizeMB = maxSize / (1024 * 1024);
    return {
      valid: false,
      error: `File size exceeds limit. Maximum ${maxSizeMB}MB for ${fileType.category}s`
    };
  }

  return { valid: true, category: fileType.category };
};

/**
 * Upload file to Cloudinary
 * @param {Object} file - File object with tempFilePath or buffer
 * @param {Object} options - Upload options
 * @param {String} options.folder - Cloudinary folder path
 * @param {String} options.resourceType - auto, image, video, raw
 * @returns {Object} - Upload result
 */
const uploadToCloudinary = async (file, options = {}) => {
  const {
    folder = 'fly8/uploads',
    resourceType = 'auto',
    publicId = null
  } = options;

  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const uploadOptions = {
      folder,
      resource_type: resourceType,
      timeout: 120000
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    let result;

    // Upload from tempFilePath (express-fileupload) or buffer
    if (file.tempFilePath) {
      result = await cloudinary.uploader.upload(file.tempFilePath, uploadOptions);
    } else if (file.buffer) {
      // Upload from buffer (multer memory storage)
      result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(file.buffer);
      });
    } else if (file.data) {
      // Upload from data buffer (express-fileupload without tempFiles)
      result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(file.data);
      });
    } else {
      throw new Error('Invalid file format - no tempFilePath, buffer, or data found');
    }

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      size: result.bytes,
      width: result.width || null,
      height: result.height || null,
      resourceType: result.resource_type,
      originalName: file.name || file.originalname || 'unknown'
    };

  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Upload multiple files to Cloudinary
 * @param {Array} files - Array of file objects
 * @param {Object} options - Upload options
 * @returns {Array} - Array of upload results
 */
const uploadMultipleToCloudinary = async (files, options = {}) => {
  const results = await Promise.all(
    files.map(file => uploadToCloudinary(file, options))
  );
  return results;
};

/**
 * Delete file from Cloudinary
 * @param {String} publicId - Cloudinary public ID
 * @param {String} resourceType - Resource type (image, video, raw)
 * @returns {Object} - Deletion result
 */
const deleteFromCloudinary = async (publicId, resourceType = 'auto') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return {
      success: result.result === 'ok',
      result: result.result
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Generate signed upload URL for direct browser upload
 * @param {Object} options - Signing options
 * @returns {Object} - Signed parameters for client-side upload
 */
const generateSignedUploadParams = (options = {}) => {
  const {
    folder = 'fly8/uploads',
    resourceType = 'auto'
  } = options;

  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    timestamp,
    folder,
    resource_type: resourceType
  };

  const signature = cloudinary.utils.api_sign_request(
    params,
    process.env.CLOUDINARY_API_SECRET
  );

  return {
    signature,
    timestamp,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder
  };
};

module.exports = {
  validateFile,
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  deleteFromCloudinary,
  generateSignedUploadParams,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZES
};
