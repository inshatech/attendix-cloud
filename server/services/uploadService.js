'use strict';
/**
 * services/uploadService.js
 * ─────────────────────────
 * Cloudinary upload helper. Reads credentials from the Cloudinary plugin
 * stored in MongoDB (managed via Admin → Plugins UI).
 *
 * Image sizes & quality targets:
 *   avatar  → 200×200 px  square crop, WebP, ~30–60 KB
 *   logo    → 400×200 px  pad/fit,     WebP, ~50–80 KB
 *   general → 800×800 px  limit,       WebP, ~80–150 KB
 */

const cloudinary = require('cloudinary').v2
const { Plugin }  = require('../models/Plugin')

let _configured = false
let _cacheTs    = 0
const CACHE_TTL = 5 * 60 * 1000  // 5-min cache so we don't hit DB on every upload

async function configure() {
  const now = Date.now()
  if (_configured && now - _cacheTs < CACHE_TTL) return true

  const p = await Plugin.findOne({ name: 'cloudinary' }).lean()
  if (!p?.enabled) throw new Error('Cloudinary plugin is disabled. Enable it in Admin → Plugins.')
  const c = p.config || {}
  if (!c.cloudName || !c.apiKey || !c.apiSecret)
    throw new Error('Cloudinary not configured. Set cloud_name, api_key, api_secret in Admin → Plugins → Cloudinary.')

  cloudinary.config({
    cloud_name:  c.cloudName,
    api_key:     c.apiKey,
    api_secret:  c.apiSecret,
    secure:      true,
  })
  _configured = true
  _cacheTs    = now
  return c
}

// ── Upload from base64 data-URI or buffer ─────────────────────────────────────
async function uploadBase64(dataUri, type = 'general', identifier = 'upload') {
  const cfg = await configure()
  const p   = await Plugin.findOne({ name: 'cloudinary' }).lean()
  const folder = (p?.config?.folder || 'attendance') + '/' + type

  const transforms = {
    avatar:  { width: 200, height: 200, crop: 'fill',  gravity: 'face', quality: 'auto:good', fetch_format: 'webp' },
    logo:    { width: 400, height: 200, crop: 'pad',   background: 'white', quality: 'auto:good', fetch_format: 'webp' },
    general: { width: 800, height: 800, crop: 'limit', quality: 'auto:good', fetch_format: 'webp' },
  }

  const t = transforms[type] || transforms.general

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id:     `${identifier}_${Date.now()}`,
    overwrite:     true,
    transformation: [t],
    resource_type: 'image',
    use_filename:  false,
    unique_filename: true,
  })

  return {
    url:       result.secure_url,
    publicId:  result.public_id,
    width:     result.width,
    height:    result.height,
    bytes:     result.bytes,
    format:    result.format,
  }
}

// ── Upload raw binary file (exe, apk, dmg, etc.) ─────────────────────────────
async function uploadRaw(dataUri, identifier = 'file') {
  await configure()
  const p      = await Plugin.findOne({ name: 'cloudinary' }).lean()
  const folder = (p?.config?.folder || 'attendance') + '/files'

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id:       `${identifier}_${Date.now()}`,
    resource_type:   'raw',
    overwrite:       true,
    use_filename:    false,
    unique_filename: true,
  })

  return {
    url:      result.secure_url,
    publicId: result.public_id,
    bytes:    result.bytes,
    format:   result.format,
  }
}

// ── Delete image from Cloudinary ──────────────────────────────────────────────
async function deleteImage(publicId) {
  if (!publicId) return
  try {
    await configure()
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
  } catch (e) {
    console.warn('[upload] delete image failed:', e.message)
  }
}

// ── Delete raw file from Cloudinary ──────────────────────────────────────────
async function deleteFile(publicId) {
  if (!publicId) return
  try {
    await configure()
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' })
  } catch (e) {
    console.warn('[upload] delete file failed:', e.message)
  }
}

// ── Extract public_id from URL for deletion ───────────────────────────────────
function publicIdFromUrl(url) {
  if (!url) return null
  try {
    // Works for both image and raw URLs:
    // https://res.cloudinary.com/CLOUD/image/upload/v123/folder/filename.webp
    // https://res.cloudinary.com/CLOUD/raw/upload/v123/folder/filename.exe
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/)
    return match ? match[1] : null
  } catch { return null }
}

module.exports = { uploadBase64, uploadRaw, deleteImage, deleteFile, publicIdFromUrl, configure }
