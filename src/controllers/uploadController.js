/**
 * Upload Controller
 * Handles file uploads for tasks and documents
 */

const { v4: uuidv4 } = require('uuid');
const Task = require('../models/Task');
const ServiceRequest = require('../models/ServiceRequest');
const { uploadToCloudinary, uploadMultipleToCloudinary, deleteFromCloudinary, validateFile } = require('../utils/fileUpload');
const { cloudinary } = require('../config/cloudinary');
const { logFileUploadEvent } = require('../utils/auditLogger');

/**
 * Upload single file
 * General purpose file upload endpoint
 */
const uploadFile = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.files.file;
    const { folder = 'fly8/general' } = req.body;

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(file, {
      folder: `${folder}/${req.user.userId}`
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Audit log
    await logFileUploadEvent(req, 'document', result.publicId, {
      name: file.name,
      url: result.url,
      size: file.size,
      type: file.mimetype
    });

    res.json({
      message: 'File uploaded successfully',
      file: {
        url: result.url,
        publicId: result.publicId,
        name: result.originalName,
        size: result.size,
        format: result.format
      }
    });

  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
};

/**
 * Upload multiple files
 */
const uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Handle single file wrapped in object
    let files = req.files.files;
    if (!Array.isArray(files)) {
      files = [files];
    }

    const { folder = 'fly8/general' } = req.body;

    // Validate all files first
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        return res.status(400).json({
          error: `File "${file.name}": ${validation.error}`
        });
      }
    }

    // Upload all files
    const results = await uploadMultipleToCloudinary(files, {
      folder: `${folder}/${req.user.userId}`
    });

    // Check for failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      return res.status(500).json({
        error: 'Some files failed to upload',
        failures: failures.map(f => f.error)
      });
    }

    // Audit log for each file
    for (const result of results) {
      await logFileUploadEvent(req, 'document', result.publicId, {
        name: result.originalName,
        url: result.url,
        size: result.size,
        type: result.format
      });
    }

    res.json({
      message: 'Files uploaded successfully',
      files: results.map(r => ({
        url: r.url,
        publicId: r.publicId,
        name: r.originalName,
        size: r.size,
        format: r.format
      }))
    });

  } catch (error) {
    console.error('Upload multiple files error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
};

/**
 * Upload files for task submission
 * Validates task ownership and attaches files to task
 */
const uploadTaskFiles = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!req.files || !req.files.files) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Find task
    const task = await Task.findOne({ taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify student is assigned to this task
    if (task.assignedTo !== req.user.userId && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You are not assigned to this task' });
    }

    // Check if task can accept submissions
    if (task.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot upload files to completed task' });
    }

    // Handle single file wrapped in object
    let files = req.files.files;
    if (!Array.isArray(files)) {
      files = [files];
    }

    // Validate all files
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        return res.status(400).json({
          error: `File "${file.name}": ${validation.error}`
        });
      }
    }

    // Upload files
    const results = await uploadMultipleToCloudinary(files, {
      folder: `fly8/tasks/${taskId}`
    });

    // Check for failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      return res.status(500).json({
        error: 'Some files failed to upload',
        failures: failures.map(f => f.error)
      });
    }

    // Prepare file records for task
    const uploadedFiles = results.map(r => ({
      name: r.originalName,
      url: r.url,
      publicId: r.publicId,
      size: r.size,
      uploadedAt: new Date()
    }));

    // Append to existing submission files or create new submission
    if (!task.submission) {
      task.submission = { files: [] };
    }
    if (!task.submission.files) {
      task.submission.files = [];
    }
    task.submission.files.push(...uploadedFiles);

    await task.save();

    // Audit log
    for (const result of results) {
      await logFileUploadEvent(req, 'task', taskId, {
        name: result.originalName,
        url: result.url,
        size: result.size,
        type: result.format
      });
    }

    res.json({
      message: 'Files uploaded to task successfully',
      files: uploadedFiles,
      taskId: task.taskId
    });

  } catch (error) {
    console.error('Upload task files error:', error);
    res.status(500).json({ error: 'Failed to upload task files' });
  }
};

/**
 * Upload document for service request
 */
const uploadServiceRequestDocument = async (req, res) => {
  try {
    const { serviceRequestId } = req.params;

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Find service request
    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });
    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Check access
    const canAccess =
      req.user.role === 'super_admin' ||
      serviceRequest.assignedCounselor === req.user.userId ||
      serviceRequest.assignedAgent === req.user.userId ||
      (req.student && serviceRequest.studentId === req.student.studentId);

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const file = req.files.file;
    const { documentName } = req.body;

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(file, {
      folder: `fly8/service-requests/${serviceRequestId}`
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Add document to service request
    serviceRequest.documents.push({
      name: documentName || file.name,
      url: result.url,
      uploadedBy: req.user.userId,
      uploadedAt: new Date()
    });

    await serviceRequest.save();

    // Audit log
    await logFileUploadEvent(req, 'service_request', serviceRequestId, {
      name: documentName || file.name,
      url: result.url,
      size: file.size,
      type: file.mimetype
    });

    res.json({
      message: 'Document uploaded successfully',
      document: {
        name: documentName || file.name,
        url: result.url,
        uploadedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Upload service request document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

/**
 * Delete uploaded file
 */
const deleteFile = async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ error: 'Public ID is required' });
    }

    // Only admins can delete files directly
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only administrators can delete files' });
    }

    const result = await deleteFromCloudinary(publicId);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to delete file' });
    }

    res.json({
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};

/**
 * Get signed upload parameters for direct browser upload
 */
const getSignedUploadParams = async (req, res) => {
  try {
    const { folder = 'fly8/direct-uploads' } = req.query;
    const { generateSignedUploadParams } = require('../utils/fileUpload');

    const params = generateSignedUploadParams({
      folder: `${folder}/${req.user.userId}`
    });

    res.json(params);

  } catch (error) {
    console.error('Get signed params error:', error);
    res.status(500).json({ error: 'Failed to generate upload parameters' });
  }
};

/**
 * Serve a Cloudinary file for viewing or downloading.
 *
 * Root causes this solves:
 *  1. Cloudinary `raw` public_ids INCLUDE the file extension (e.g. "file.pdf"),
 *     so it must NOT be stripped when building download URLs.
 *  2. For `image` resource type the extension is separate (format field).
 *  3. Streaming via https.get() returns 401 because Cloudinary blocks requests
 *     with no User-Agent; we add one and only use it as a fallback.
 *
 * Query params:
 *   url   – stored Cloudinary secure_url (required)
 *   name  – suggested filename for Content-Disposition (optional)
 *   mode  – "view" = inline preview | anything else = forced download
 */
const downloadCloudinaryFile = (req, res) => {
  const { url, name, mode } = req.query;
  if (!url) return res.status(400).json({ error: 'url query param required' });

  let parsedUrl;
  try { parsedUrl = new URL(url); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }

  if (!parsedUrl.hostname.endsWith('cloudinary.com')) {
    return res.redirect(302, url);
  }

  const inline = mode === 'view';
  const filename = name || parsedUrl.pathname.split('/').pop() || 'file';

  // ── SHARED: parse public_id ────────────────────────────────────────────────
  // Works for both view and download. Must be extracted before branching.
  const pathMatch = parsedUrl.pathname.match(
    /^\/[^/]+\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/
  );
  if (!pathMatch) return res.redirect(302, url);

  const resourceType = pathMatch[1];
  const fullPath = decodeURIComponent(pathMatch[2]);

  // For `raw` uploads the extension is PART of the public_id in Cloudinary.
  // For `image`/`video` the extension is the format field (stored separately).
  let publicId, format;
  if (resourceType === 'raw') {
    publicId = fullPath;
    format = '';
  } else {
    const dot = fullPath.lastIndexOf('.');
    if (dot > 0 && fullPath.length - dot <= 5) {
      publicId = fullPath.slice(0, dot);
      format = fullPath.slice(dot + 1);
    } else {
      publicId = fullPath;
      format = '';
    }
  }

  // ── VIEW MODE ──────────────────────────────────────────────────────────────
  // Generate a signed Cloudinary delivery URL, then proxy the bytes through
  // our backend. This avoids the browser CORS block that occurs when the
  // frontend fetch() follows a redirect to res.cloudinary.com (Cloudinary's
  // CDN does not serve Access-Control-Allow-Origin for signed delivery URLs).
  // Proxying also keeps the Blob URL approach intact so the iframe is
  // same-origin and bypasses any X-Frame-Options restrictions.
  if (inline) {
    let fetchUrl;
    try {
      fetchUrl = cloudinary.url(publicId, {
        resource_type: resourceType,
        type: 'upload',
        sign_url: true,
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 600
      });
    } catch (err) {
      console.error('Cloudinary view sign error:', err.message);
      fetchUrl = url; // fallback: try the original URL
    }

    const fetchParsed = new URL(fetchUrl);
    const proto = fetchParsed.protocol === 'https:' ? require('https') : require('http');

    const upstreamReq = proto.get(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Fly8/2.0; +https://fly8.study)',
        'Accept': '*/*',
        'Accept-Encoding': 'identity'
      },
      timeout: 30000 // 30s upstream timeout — prevents hung requests
    }, (upstream) => {
      if (upstream.statusCode !== 200) {
        upstream.resume();
        if (!res.headersSent) return res.status(upstream.statusCode || 502).json({ error: 'File not available from storage', status: upstream.statusCode });
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', upstream.headers['content-type'] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
      res.setHeader('Cache-Control', 'private, max-age=300');
      upstream.pipe(res);
    });

    upstreamReq.on('timeout', () => {
      upstreamReq.destroy();
      if (!res.headersSent) res.status(504).json({ error: 'Storage timeout' });
    });

    upstreamReq.on('error', (err) => {
      console.error('Cloudinary proxy error:', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch file from storage' });
    });

    return;
  }

  // ── DOWNLOAD MODE ──────────────────────────────────────────────────────────

  try {
    const downloadUrl = cloudinary.utils.private_download_url(publicId, format, {
      resource_type: resourceType,
      type: 'upload',
      expires_at: Math.floor(Date.now() / 1000) + 600,
      attachment: filename
    });
    return res.redirect(302, downloadUrl);
  } catch (signErr) {
    console.error('Cloudinary sign error, falling back to stream:', signErr.message);
  }

  // ── STREAM FALLBACK ────────────────────────────────────────────────────────
  // Only reached if private_download_url throws. Adds a User-Agent so
  // Cloudinary doesn't block the server-side request.
  const protocol = parsedUrl.protocol === 'https:' ? require('https') : require('http');

  protocol.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Fly8/2.0; +https://fly8.study)',
      'Accept': '*/*',
      'Accept-Encoding': 'identity'
    }
  }, (upstream) => {
    if (upstream.statusCode !== 200) {
      upstream.resume();
      if (!res.headersSent) return res.redirect(302, url); // last resort
      return;
    }
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    res.setHeader('Cache-Control', 'private, max-age=60');
    upstream.pipe(res);
  }).on('error', () => {
    if (!res.headersSent) res.redirect(302, url);
  });
};

module.exports = {
  uploadFile,
  uploadMultipleFiles,
  uploadTaskFiles,
  uploadServiceRequestDocument,
  deleteFile,
  getSignedUploadParams,
  downloadCloudinaryFile
};
